/**
 * @fileoverview 工具运行环境安装服务的单元测试。
 * 把安装器换成假的，run 什么时候结束由测试决定，验证单飞、进度广播、节流和结束时的状态。
 * 路由也在这里测，验证发起接口不等装完就返回。
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  RuntimeInstallState,
  RuntimeInstallStep,
  RuntimeStatus,
  ServerMessage,
  UvStatus,
} from '@persona/shared';

const NOT_INSTALLED: UvStatus = { ok: false, source: null, path: null };

const broadcastSpy = mock((_event: unknown) => {});
const invalidateSpy = mock(() => {});
const logSpy = mock(
  (_category: string, _message: string, _data?: unknown) => {}
);
const criticalSpy = mock(
  (_category: string, _message: string, _data?: unknown) => {}
);

mock.module('../src/server/websocket-server.js', () => ({
  broadcastToAll: broadcastSpy,
}));

mock.module('../src/util/uv-runtime.js', () => ({
  invalidateUvCache: invalidateSpy,
  detectUv: async () => NOT_INSTALLED,
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: logSpy,
    critical: criticalSpy,
    initialize: () => '',
    setEnabled: () => {},
    setSessionManagers: () => {},
  },
}));

type Progress = (
  step: RuntimeInstallStep,
  received: number,
  total: number | null
) => void;

/** 和真实安装器同名同形状的错误类，服务靠 instanceof 认它 */
class InstallError extends Error {
  constructor(
    message: string,
    readonly kind: string
  ) {
    super(message);
    this.name = 'InstallError';
  }
}

/** 假的安装器，run 返回的 Promise 由测试决定何时结束，进度由测试手动上报 */
class FakeInstaller {
  static instances: FakeInstaller[] = [];
  private readonly settle: {
    resolve: () => void;
    reject: (err: Error) => void;
  };
  private readonly finished: Promise<void>;

  constructor(private readonly onProgress: Progress) {
    FakeInstaller.instances.push(this);
    this.finished = new Promise<void>((resolve, reject) => {
      this.settle = { resolve, reject };
    });
  }

  run(): Promise<void> {
    return this.finished;
  }

  report(step: RuntimeInstallStep, received: number, total: number | null) {
    this.onProgress(step, received, total);
  }

  /** 让这次安装成功结束，等服务的收尾跑完 */
  async succeed(): Promise<void> {
    this.settle.resolve();
    await this.finished;
  }

  /** 让这次安装失败结束，等服务的收尾跑完 */
  async fail(error: Error): Promise<void> {
    this.settle.reject(error);
    await this.finished.catch(() => {});
  }
}

mock.module('../src/util/uv-installer.js', () => ({
  InstallError,
  UvInstaller: FakeInstaller,
}));

import {
  _resetState,
  getRuntimeInstall,
  startRuntimeInstall,
} from '../src/server/services/runtime-install-service.js';
import { createRuntimesRouter } from '../src/server/routers/runtimes.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 最近一次广播出去的安装状态 */
const lastBroadcast = (): RuntimeInstallState | null => {
  const event = broadcastSpy.mock.calls.at(-1)?.[0] as
    | Extract<ServerMessage, { type: 'runtime_install' }>
    | undefined;
  return event?.install ?? null;
};

const latestInstaller = (): FakeInstaller => FakeInstaller.instances.at(-1)!;

beforeEach(() => {
  broadcastSpy.mockClear();
  invalidateSpy.mockClear();
  logSpy.mockClear();
  criticalSpy.mockClear();
  FakeInstaller.instances = [];
  _resetState();
});

describe('runtime-install-service', () => {
  it('starts in the running state and broadcasts it before the installer runs', () => {
    const state = startRuntimeInstall();

    expect(state).toEqual({
      status: 'running',
      step: 'uv',
      received: 0,
      total: null,
    });
    expect(getRuntimeInstall()).toEqual(state);
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(lastBroadcast()).toEqual(state);
    expect(FakeInstaller.instances).toHaveLength(1);
  });

  it('ignores a second start while an install is running', () => {
    startRuntimeInstall();
    latestInstaller().report('python', 300, 900);
    const before = getRuntimeInstall();

    const second = startRuntimeInstall();

    expect(second).toEqual(before);
    expect(FakeInstaller.instances).toHaveLength(1);
    expect(getRuntimeInstall()).toEqual(before);
  });

  it('tracks progress and broadcasts the current step and byte counts', () => {
    startRuntimeInstall();

    latestInstaller().report('python', 500, 1000);

    expect(getRuntimeInstall()).toEqual({
      status: 'running',
      step: 'python',
      received: 500,
      total: 1000,
    });
    expect(lastBroadcast()).toEqual(getRuntimeInstall());
  });

  it('throttles progress inside a step but broadcasts a step change at once', async () => {
    startRuntimeInstall();
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    const installer = latestInstaller();

    for (let i = 1; i <= 5; i++) installer.report('uv', i * 10, 100);
    expect(getRuntimeInstall()?.received).toBe(50);
    expect(broadcastSpy).toHaveBeenCalledTimes(1);

    installer.report('setup', 0, null);
    expect(broadcastSpy).toHaveBeenCalledTimes(2);
    expect(lastBroadcast()?.step).toBe('setup');

    await sleep(150);
    installer.report('setup', 0, null);
    expect(broadcastSpy).toHaveBeenCalledTimes(3);
  });

  it('keeps a failed install with its category and broadcasts the end once', async () => {
    startRuntimeInstall();
    latestInstaller().report('uv', 1200, 14700626);
    const before = broadcastSpy.mock.calls.length;

    await latestInstaller().fail(new InstallError('socket closed', 'network'));

    expect(getRuntimeInstall()).toEqual({
      status: 'failed',
      step: 'uv',
      received: 1200,
      total: 14700626,
      error: 'network',
    });
    expect(broadcastSpy.mock.calls.length).toBe(before + 1);
    expect(lastBroadcast()).toEqual(getRuntimeInstall());
    expect(criticalSpy).toHaveBeenCalledTimes(1);
    expect(criticalSpy.mock.calls[0][1]).toContain('kind=network');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('treats an error without a category as a local failure', async () => {
    startRuntimeInstall();

    await latestInstaller().fail(new Error('disk on fire'));

    expect(getRuntimeInstall()?.error).toBe('local');
    expect(criticalSpy.mock.calls[0][1]).toContain('kind=local');
  });

  it('clears the state, re-detects and broadcasts the end once on success', async () => {
    startRuntimeInstall();
    latestInstaller().report('setup', 0, null);
    const before = broadcastSpy.mock.calls.length;

    await latestInstaller().succeed();

    expect(getRuntimeInstall()).toBeNull();
    expect(broadcastSpy.mock.calls.length).toBe(before + 1);
    expect(lastBroadcast()).toBeNull();
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(criticalSpy).not.toHaveBeenCalled();
  });

  it('starts a new install after the previous one failed', async () => {
    startRuntimeInstall();
    await latestInstaller().fail(new InstallError('boom', 'server'));

    const state = startRuntimeInstall();

    expect(FakeInstaller.instances).toHaveLength(2);
    expect(state.status).toBe('running');
  });

  it('hands out copies so callers cannot change the internal state', () => {
    const state = startRuntimeInstall();
    state.received = 999999;

    expect(getRuntimeInstall()?.received).toBe(0);
  });
});

describe('runtimes router', () => {
  let server: Server;
  let baseUrl: string;

  const query = async (): Promise<RuntimeStatus> => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    return (await response.json()) as RuntimeStatus;
  };

  beforeEach(async () => {
    const app = express();
    app.use('/api/runtimes', createRuntimesRouter());
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/runtimes`;
  });

  afterEach(() => {
    server.closeAllConnections();
    server.close();
  });

  it('answers the install request with 202 without waiting for the installer', async () => {
    const response = await fetch(`${baseUrl}/uv/install`, {
      method: 'POST',
    });
    const body = (await response.json()) as RuntimeStatus;

    expect(response.status).toBe(202);
    expect(body.install?.status).toBe('running');
    // 假的安装器还没有结束，接口却已经回来了
    expect(getRuntimeInstall()?.status).toBe('running');
  });

  it('reports the install on query, running first and failed afterwards', async () => {
    expect((await query()).install).toBeNull();

    await fetch(`${baseUrl}/uv/install`, { method: 'POST' });
    const during = await query();
    expect(during.uv).toEqual(NOT_INSTALLED);
    expect(during.install?.status).toBe('running');

    await latestInstaller().fail(new InstallError('boom', 'network'));

    const after = await query();
    expect(after.install).toEqual({
      status: 'failed',
      step: 'uv',
      received: 0,
      total: null,
      error: 'network',
    });
  });

  it('clears the install on query after a success', async () => {
    await fetch(`${baseUrl}/uv/install`, { method: 'POST' });

    await latestInstaller().succeed();

    expect((await query()).install).toBeNull();
  });
});
