import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  RuntimeInstallError,
  RuntimeInstallState,
  RuntimeInstallStep,
  RuntimeStatus,
  ServerMessage,
  UvStatus,
} from '@persona/shared';
import type { ToastType } from '@/stores/toastStore';
import * as api from '@/lib/api';
import {
  deriveUvState,
  FAILED_KEY,
  useRuntimeStore,
} from '@/stores/runtimeStore';
import { useToastStore } from '@/stores/toastStore';

vi.mock('@/lib/api', () => ({
  getRuntimeStatus: vi.fn(),
  startRuntimeInstall: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  default: { t: (key: string) => key },
}));

const READY: UvStatus = {
  ok: true,
  source: 'app',
  path: '/runtimes/uv',
  version: 'uv 0.13.10',
};
const MISSING: UvStatus = { ok: false, source: null, path: null };

const running = (
  step: RuntimeInstallStep = 'uv',
  received = 0,
  total: number | null = null
): RuntimeInstallState => ({ status: 'running', step, received, total });

const failed = (error: RuntimeInstallError): RuntimeInstallState => ({
  status: 'failed',
  step: 'uv',
  received: 0,
  total: null,
  error,
});

/** 一条 runtime_install 推送 */
const push = (install: RuntimeInstallState | null): ServerMessage => ({
  type: 'runtime_install',
  install,
});

/** 当前某类 Toast 的文案列表 */
const toastsOf = (type: ToastType): string[] =>
  useToastStore
    .getState()
    .toasts.filter((item) => item.type === type)
    .map((item) => item.message);

/** 一个由测试决定何时落定的查询响应 */
function deferredStatus(): {
  promise: Promise<RuntimeStatus>;
  resolve: (status: RuntimeStatus) => void;
  reject: (err: Error) => void;
} {
  let resolve!: (status: RuntimeStatus) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<RuntimeStatus>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 让已经落定的 promise 的后续回调跑完 */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(globalThis, 'window', {
    value: { api: { log: vi.fn().mockResolvedValue(undefined) } },
    writable: true,
  });
  useRuntimeStore.setState({ uv: null, install: null, version: 0 });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('deriveUvState', () => {
  it('shows checking while the detection result has not arrived', () => {
    expect(deriveUvState(null, null)).toBe('loading');
    expect(deriveUvState(null, failed('network'))).toBe('missing');
  });

  it('follows the detection result when nothing is being installed', () => {
    expect(deriveUvState(READY, null)).toBe('ready');
    expect(deriveUvState(MISSING, null)).toBe('missing');
  });

  it('lets a running install take priority over everything else', () => {
    expect(deriveUvState(READY, running())).toBe('installing');
    expect(deriveUvState(MISSING, running('python', 1, 10))).toBe('installing');
  });

  it('folds a failed install back into not installed', () => {
    expect(deriveUvState(READY, failed('slow'))).toBe('missing');
    expect(deriveUvState(MISSING, failed('local'))).toBe('missing');
  });
});

describe('handleWsMessage', () => {
  it('tracks a running broadcast without toasting', () => {
    useRuntimeStore.setState({ uv: MISSING, install: running() });

    useRuntimeStore
      .getState()
      .handleWsMessage(push(running('python', 500, 1000)));

    expect(useRuntimeStore.getState().install).toEqual(
      running('python', 500, 1000)
    );
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(api.getRuntimeStatus).not.toHaveBeenCalled();
  });

  it('ignores messages that are not runtime_install', () => {
    useRuntimeStore.setState({ uv: READY, install: null });

    useRuntimeStore.getState().handleWsMessage({ type: 'pong' });

    expect(useRuntimeStore.getState().uv).toEqual(READY);
  });

  it('toasts success, clears the install and queries again on the end broadcast', async () => {
    useRuntimeStore.setState({ uv: MISSING, install: running('setup') });
    vi.mocked(api.getRuntimeStatus).mockResolvedValue({
      uv: READY,
      install: null,
    });

    useRuntimeStore.getState().handleWsMessage(push(null));
    // 查询还没回来之前这一行显示检测中，不会闪出可以点的一键下载
    expect(useRuntimeStore.getState().uv).toBeNull();
    expect(useRuntimeStore.getState().install).toBeNull();
    expect(toastsOf('success')).toEqual(['config.uvInstalled']);
    expect(api.getRuntimeStatus).toHaveBeenCalledTimes(1);

    await flush();

    expect(useRuntimeStore.getState().uv).toEqual(READY);
  });

  it('toasts the line of the failure category and keeps the category', () => {
    useRuntimeStore.setState({
      uv: MISSING,
      install: running('uv', 1000, 2000),
    });

    useRuntimeStore.getState().handleWsMessage(push(failed('slow')));

    expect(useRuntimeStore.getState().install).toEqual(failed('slow'));
    expect(toastsOf('error')).toEqual([FAILED_KEY.slow]);
  });

  it('names every failure category in the toast', () => {
    const kinds: RuntimeInstallError[] = [
      'network',
      'slow',
      'server',
      'corrupted',
      'unsupported',
      'local',
    ];

    for (const kind of kinds) {
      useToastStore.setState({ toasts: [] });
      useRuntimeStore.setState({ uv: MISSING, install: running() });
      useRuntimeStore.getState().handleWsMessage(push(failed(kind)));
      expect(toastsOf('error')).toEqual([FAILED_KEY[kind]]);
    }
  });

  it('does not toast when the previous state was not running', () => {
    useRuntimeStore.setState({ uv: MISSING, install: null });

    useRuntimeStore.getState().handleWsMessage(push(failed('network')));
    useRuntimeStore.getState().handleWsMessage(push(null));

    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(useRuntimeStore.getState().install).toBeNull();
  });

  it('does not toast twice for a repeated end broadcast', () => {
    useRuntimeStore.setState({ uv: MISSING, install: running('setup') });
    vi.mocked(api.getRuntimeStatus).mockResolvedValue({
      uv: READY,
      install: null,
    });

    useRuntimeStore.getState().handleWsMessage(push(null));
    useRuntimeStore.getState().handleWsMessage(push(null));

    expect(toastsOf('success')).toEqual(['config.uvInstalled']);
  });
});

describe('refresh', () => {
  it('overwrites the local state without toasting', async () => {
    useRuntimeStore.setState({ uv: READY, install: null });
    vi.mocked(api.getRuntimeStatus).mockResolvedValue({
      uv: MISSING,
      install: running('python', 3, 9),
    });

    await useRuntimeStore.getState().refresh();

    expect(useRuntimeStore.getState().uv).toEqual(MISSING);
    expect(useRuntimeStore.getState().install).toEqual(running('python', 3, 9));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('falls back to not installed and clears the install when the query fails', async () => {
    useRuntimeStore.setState({ uv: READY, install: running('python', 3, 9) });
    vi.mocked(api.getRuntimeStatus).mockRejectedValue(new Error('offline'));

    await useRuntimeStore.getState().refresh();

    expect(useRuntimeStore.getState().uv?.ok).toBe(false);
    expect(useRuntimeStore.getState().install).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('drops a response that arrives after a newer broadcast', async () => {
    const pending = deferredStatus();
    vi.mocked(api.getRuntimeStatus).mockReturnValue(pending.promise);

    const refreshing = useRuntimeStore.getState().refresh();
    useRuntimeStore.getState().handleWsMessage(push(running('uv', 5, 10)));
    pending.resolve({ uv: READY, install: null });
    await refreshing;

    expect(useRuntimeStore.getState().install).toEqual(running('uv', 5, 10));
    expect(useRuntimeStore.getState().uv).toBeNull();
  });
});

describe('start', () => {
  it('turns the row into installing at once and applies the accepted state', async () => {
    const pending = deferredStatus();
    vi.mocked(api.startRuntimeInstall).mockReturnValue(pending.promise);
    useRuntimeStore.setState({ uv: MISSING, install: null });

    const starting = useRuntimeStore.getState().start();
    expect(useRuntimeStore.getState().install).toEqual(running());

    pending.resolve({ uv: MISSING, install: running('uv', 0, 14700626) });
    await starting;

    expect(useRuntimeStore.getState().install).toEqual(
      running('uv', 0, 14700626)
    );
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not send a request while an install is running', async () => {
    useRuntimeStore.setState({ uv: MISSING, install: running() });

    await useRuntimeStore.getState().start();

    expect(api.startRuntimeInstall).not.toHaveBeenCalled();
  });

  it('reverts and toasts network unreachable when the request fails', async () => {
    useRuntimeStore.setState({ uv: MISSING, install: failed('server') });
    vi.mocked(api.startRuntimeInstall).mockRejectedValue(new Error('offline'));

    await useRuntimeStore.getState().start();

    expect(useRuntimeStore.getState().install).toEqual(failed('server'));
    expect(toastsOf('error')).toEqual([FAILED_KEY.network]);
  });

  it('follows the broadcast when the request fails after a broadcast arrived', async () => {
    const pending = deferredStatus();
    vi.mocked(api.startRuntimeInstall).mockReturnValue(pending.promise);
    useRuntimeStore.setState({ uv: MISSING, install: null });

    const starting = useRuntimeStore.getState().start();
    useRuntimeStore.getState().handleWsMessage(push(running('python', 2, 4)));
    pending.reject(new Error('socket hung up'));
    await starting;

    expect(useRuntimeStore.getState().install).toEqual(running('python', 2, 4));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
