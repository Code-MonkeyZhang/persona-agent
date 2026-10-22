/**
 * @fileoverview Cloudflare Tunnel service — manages the cloudflared subprocess lifecycle.
 *
 * State machine: stopped → starting → running → stopped
 *                                   ↘ error  → stopped
 *
 * The binary is expected alongside the server executable (via process.execPath).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { getCloudflaredBinPath } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';

type TunnelStatus = 'stopped' | 'starting' | 'running' | 'error';
type TunnelHealth = 'unknown' | 'healthy' | 'unhealthy';

interface TunnelState {
  status: TunnelStatus;
  url: string | null;
  error: string | null;
  health: TunnelHealth;
}

/** 出地址的最长等待，超时判启动失败 */
const START_TIMEOUT_MS = 30_000;
/** SIGTERM 后等待进程退出的宽限，超时升级为强制结束 */
const STOP_GRACE_MS = 2_000;
/** SIGKILL 后等待退出事件的兜底，保证停止动作必定返回 */
const KILL_WAIT_MS = 500;
/** 入口连接归零后等待恢复的宽限，烧完判不可用 */
const EDGE_GRACE_MS = 10_000;
/** 输出流留档行数，出地址前失败时进日志供排查 */
const TAIL_LINES = 10;

/** 各计时的默认值，_resetState 据此恢复 */
const DEFAULT_TIMINGS = {
  startTimeoutMs: START_TIMEOUT_MS,
  stopGraceMs: STOP_GRACE_MS,
  killWaitMs: KILL_WAIT_MS,
  edgeGraceMs: EDGE_GRACE_MS,
};

/** 测试专用的时序缩放，改小后可快速验证计时逻辑 */
export const _timings = { ...DEFAULT_TIMINGS };

/** 尚无任何运行时的空态快照 */
const IDLE_STATE: TunnelState = {
  status: 'stopped',
  url: null,
  error: null,
  health: 'unknown',
};

/**
 * Regex patterns to extract the public URL from cloudflared stdout/stderr.
 * Requires at least one hyphen in the subdomain to avoid matching api.trycloudflare.com.
 */
const URL_PATTERNS = [
  /https:\/\/[a-zA-Z0-9]+-[a-zA-Z0-9-]+\.trycloudflare\.com/,
  /https?:\/\/[a-zA-Z0-9-]+\.pages\.dev/,
  /Your quick Tunnel has run and reached the necessary daemon.*?https?:\/\/([^\s]+)/,
];

/** 匹配 cloudflared 报告与公网入口连接建立的日志行 */
const EDGE_REGISTERED_PATTERN = /Registered tunnel connection/;
/** 匹配 cloudflared 报告与公网入口连接断开的日志行 */
const EDGE_UNREGISTERED_PATTERN = /Unregistered tunnel connection/;

/**
 * 一次启动对应的运行对象，包住该次运行的全部状态与行为。
 *
 * - 进程句柄、阶段、地址、健康度、连接计数、留档与定时器都是私有字段
 * - 子进程的输出与结束事件只进自己所属的对象，迟到的旧事件碰不到新对象
 * - 运行结束时经 onEnded 回调门面，门面核对身份后才清引用
 */
class TunnelRun {
  private status: TunnelStatus = 'starting';
  private url: string | null = null;
  private error: string | null = null;
  private health: TunnelHealth = 'unknown';
  private edgeConnections = 0;
  private readonly tail: string[] = [];
  private finished = false;
  private stopping = false;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private edgeGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly exited: Promise<void>;
  private exitResolve!: () => void;
  readonly started: Promise<string>;
  private resolveStart!: (url: string) => void;
  private rejectStart!: (error: Error) => void;

  constructor(
    private readonly child: ChildProcess,
    private readonly onEnded: (run: TunnelRun) => void
  ) {
    this.started = new Promise((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    this.exited = new Promise((resolve) => {
      this.exitResolve = resolve;
    });
    this.startTimer = setTimeout(
      () => this.onStartTimeout(),
      _timings.startTimeoutMs
    );
    this.child.stdout?.on('data', (data: Buffer) =>
      this.onOutput(data.toString())
    );
    this.child.stderr?.on('data', (data: Buffer) =>
      this.onOutput(data.toString())
    );
    this.child.on('exit', (code) =>
      this.handleEnd(
        `cloudflared exited with code ${code} before URL was found`
      )
    );
    this.child.on('error', (error: Error) => this.handleEnd(error.message));
  }

  /**
   * Try to extract a public URL from a line of cloudflared output.
   * Resolves the start promise on the first match.
   */
  private tryFindUrl(line: string): void {
    if (this.url) return;
    for (const pattern of URL_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const url = match[1] || match[0];
        Logger.log('TUNNEL', 'Got URL', url);
        if (this.startTimer) clearTimeout(this.startTimer);
        this.startTimer = null;
        this.url = url;
        this.status = 'running';
        this.resolveStart(url);
        return;
      }
    }
  }

  /**
   * 按 cloudflared 的连接报告维护健康度。
   * 连接数大于零即健康，归零后先给宽限期，宽限内恢复不计不可用。
   */
  private countEdgeConnection(line: string): void {
    if (EDGE_REGISTERED_PATTERN.test(line)) {
      this.edgeConnections++;
      this.clearEdgeGrace();
      this.setHealth(
        'healthy',
        `Tunnel healthy (edge connections: ${this.edgeConnections})`
      );
    } else if (EDGE_UNREGISTERED_PATTERN.test(line)) {
      this.edgeConnections = Math.max(0, this.edgeConnections - 1);
      if (this.edgeConnections === 0) {
        this.edgeGraceTimer = setTimeout(() => {
          this.setHealth(
            'unhealthy',
            `Tunnel unhealthy (no edge connection for ${_timings.edgeGraceMs / 1000}s)`
          );
        }, _timings.edgeGraceMs);
      }
    }
  }

  /** 健康度只在取值变化时记录日志，避免连接增减刷屏。 */
  private setHealth(health: TunnelHealth, message: string): void {
    if (this.health === health) return;
    this.health = health;
    Logger.log('TUNNEL', message);
  }

  private clearEdgeGrace(): void {
    if (this.edgeGraceTimer) {
      clearTimeout(this.edgeGraceTimer);
      this.edgeGraceTimer = null;
    }
  }

  private onOutput(text: string): void {
    for (const line of text.split('\n')) {
      if (!line) continue;
      this.tail.push(line);
      if (this.tail.length > TAIL_LINES) this.tail.shift();
      this.tryFindUrl(line);
      this.countEdgeConnection(line);
    }
  }

  private onStartTimeout(): void {
    if (this.finished) return;
    Logger.log('TUNNEL', 'Timeout waiting for URL');
    this.error = 'Timeout waiting for tunnel URL';
    this.rejectStart(new Error(this.error));
    void this.stop();
  }

  /**
   * 分级停止子进程。
   * 先发 SIGTERM 等待宽限，未退出升级 SIGKILL 再兜底等待，必定返回。
   */
  async stop(): Promise<void> {
    if (this.finished) return;
    this.stopping = true;
    this.clearEdgeGrace();
    const graceful = this.waitExit(_timings.stopGraceMs);
    this.kill('SIGTERM');
    if (!(await graceful)) {
      Logger.log('TUNNEL', 'cloudflared ignored SIGTERM, sending SIGKILL');
      this.kill('SIGKILL');
      await this.waitExit(_timings.killWaitMs);
    }
  }

  private waitExit(ms: number): Promise<boolean> {
    return Promise.race([
      this.exited.then(() => true),
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), ms);
        timer.unref?.();
      }),
    ]);
  }

  private kill(signal: NodeJS.Signals): void {
    try {
      this.child.kill(signal);
    } catch {
      // Process may have already exited
    }
  }

  /**
   * 进程终态的唯一收尾点，exit 与 error 事件先到者触发。
   * 出地址前失败时留档输出末尾，主动停止且未出地址按已停止收尾。
   */
  private handleEnd(failureMessage: string): void {
    if (this.finished) return;
    this.finished = true;
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    this.clearEdgeGrace();
    this.exitResolve();

    if (!this.url) {
      if (!this.stopping || this.error) {
        this.error = this.error ?? failureMessage;
        Logger.log('TUNNEL', 'Output tail before exit', this.tail.join('\n'));
        this.rejectStart(new Error(this.error));
      } else {
        this.rejectStart(new Error('Tunnel stopped before URL was found'));
      }
    }
    this.status =
      this.url || (this.stopping && !this.error) ? 'stopped' : 'error';
    this.url = null;
    this.health = 'unknown';
    Logger.log('TUNNEL', 'Process exited', { status: this.status });
    this.onEnded(this);
  }

  snapshot(): TunnelState {
    return {
      status: this.status,
      url: this.url,
      error: this.error,
      health: this.health,
    };
  }
}

let current: TunnelRun | null = null;
/** 上一任运行的终态快照，仅在 onRunEnded 单点写入，让失败信息在停止后仍可读 */
let lastSnapshot: TunnelState = { ...IDLE_STATE };

/**
 * 运行对象的结束回调，全文件唯一的身份核对点。
 * 迟到的旧运行在此被拦下，只有当前运行才允许清引用。
 */
const onRunEnded = (run: TunnelRun): void => {
  if (run !== current) return;
  lastSnapshot = run.snapshot();
  current = null;
};

/**
 * Start a Cloudflare Tunnel that proxies traffic to the given local port.
 *
 * @param localPort - The local port to expose via the tunnel.
 * @returns The public tunnel URL once cloudflared outputs it.
 * @throws If the binary is missing, spawn fails, or the 30s timeout is reached.
 */
export async function startTunnel(localPort: number): Promise<string> {
  const active = current?.snapshot();
  if (active?.status === 'running') {
    return active.url!;
  }

  if (active?.status === 'starting') {
    throw new Error('Tunnel is already starting');
  }

  const binPath = getCloudflaredBinPath();
  if (!existsSync(binPath)) {
    throw new Error(
      `cloudflared binary not found at ${binPath}. ` +
        'Please ensure it is installed before starting the tunnel.'
    );
  }

  Logger.log('TUNNEL', 'Starting cloudflared', { localPort });

  let proc: ChildProcess;
  try {
    proc = spawn(
      binPath,
      [
        'tunnel',
        '--url',
        `http://localhost:${localPort}`,
        '--protocol',
        'http2',
        '--no-autoupdate',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.log('TUNNEL', 'Failed to start', err.message);
    lastSnapshot = { ...IDLE_STATE, status: 'error', error: err.message };
    throw err;
  }

  const run = new TunnelRun(proc, onRunEnded);
  current = run;
  return run.started;
}

/**
 * Stop the running cloudflared subprocess.
 * Sends SIGTERM and waits a grace period, then escalates to SIGKILL if still alive.
 */
export async function stopTunnel(): Promise<void> {
  if (!current) return;

  Logger.log('TUNNEL', 'Stopping tunnel...');
  await current.stop();
  Logger.log('TUNNEL', 'Tunnel stopped');
}

/**
 * Return a snapshot of the current tunnel state.
 */
export function getTunnelStatus(): TunnelState {
  return current ? current.snapshot() : { ...lastSnapshot };
}

/**
 * Reset internal state — used only by tests.
 */
export function _resetState(): void {
  current = null;
  lastSnapshot = { ...IDLE_STATE };
  Object.assign(_timings, DEFAULT_TIMINGS);
}
