/**
 * @fileoverview 共用文件下载器。
 *
 * FileDownloader 只认地址、目标路径和一组下载规则，不认得下载的是什么，也不负责校验内容和解压。
 * 边收边写盘，每收到一块数据回报一次进度，失败时抛出带类别的 DownloadError。
 * 环境安装是第一个使用者，商城以后下载工具文件也接这里，等待和重试的规则只维护一份。
 */

import * as fs from 'node:fs';
import { Logger } from './logger.js';

/** 下载器自己会给出的失败类别，文件校验不通过和系统不支持这两类由调用方判断 */
export type DownloadErrorKind = 'network' | 'slow' | 'server' | 'local';

/**
 * 下载失败。
 * kind 是失败类别，retryable 表示再试一次有没有希望成功，决定它的是失败的原因而不是已经试过几次。
 */
export class DownloadError extends Error {
  constructor(
    message: string,
    readonly kind: DownloadErrorKind,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'DownloadError';
  }
}

/** 下载规则，时间一律是毫秒 */
export interface DownloadRules {
  /** 连接一个地址最多等多久，响应头一直不到就按网络不通处理 */
  connectTimeoutMs: number;
  /** 连上以后多久没有收到新数据算卡死，超过就按下载太慢处理 */
  stallTimeoutMs: number;
  /** 每个地址最多试几次 */
  maxAttempts: number;
  /** 两次尝试之间等多久 */
  retryDelayMs: number;
}

export const DEFAULT_DOWNLOAD_RULES: Readonly<DownloadRules> = {
  connectTimeoutMs: 10_000,
  stallTimeoutMs: 30_000,
  maxAttempts: 2,
  retryDelayMs: 2_000,
};

/** 一次进度回报，响应头还没到时 total 是 null */
export interface DownloadProgress {
  received: number;
  total: number | null;
}

/** 服务器临时出错的状态码，过一会儿再请求有希望成功，5xx 另算 */
const TRANSIENT_STATUS = new Set([408, 425, 429]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 读响应头里声明的字节数，没有声明或者不是数字时返回 null */
const contentLength = (response: Response): number | null => {
  const value = Number(response.headers.get('content-length'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** 写盘失败的错误。磁盘满或者没有权限时再试一次结果一样，所以不再试 */
const writeFailed = (dest: string, cause: unknown): DownloadError =>
  new DownloadError(`Failed to write ${dest}`, 'local', false, { cause });

export class FileDownloader {
  constructor(private readonly rules: DownloadRules = DEFAULT_DOWNLOAD_RULES) {}

  /**
   * 把 url 指向的文件下载到 dest。
   *
   * - 边收边写，每收到一块数据调用一次 onProgress
   * - deadline 是整件事的截止时刻，它先到就按下载太慢失败并且不再试
   * - 失败时删掉写了一半的文件，调用方不会拿到半个文件
   *
   * @throws DownloadError 每次尝试都失败时抛出
   */
  async download(
    url: string,
    dest: string,
    onProgress: (progress: DownloadProgress) => void,
    deadline: number
  ): Promise<void> {
    const { maxAttempts, retryDelayMs } = this.rules;
    let received = 0;
    let total: number | null = null;
    /** 转发进度的同时记下最后一帧，失败时写进日志 */
    const track = (progress: DownloadProgress): void => {
      received = progress.received;
      total = progress.total;
      onProgress(progress);
    };

    for (let attempt = 1; ; attempt++) {
      const startedAt = Date.now();
      Logger.log('DOWNLOAD', `Attempt ${attempt} of ${maxAttempts} starting`, {
        url,
      });
      try {
        await this.tryOnce(url, dest, track, deadline);
        Logger.log('DOWNLOAD', 'Download finished', {
          url,
          attempt,
          receivedBytes: received,
          totalBytes: total,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      } catch (err) {
        // 进度回调自己抛出的错误不是下载失败，原样往上抛
        if (!(err instanceof DownloadError)) throw err;
        fs.rmSync(dest, { force: true });
        const summary = `kind=${err.kind}, attempt=${attempt}, received=${received} of ${total ?? 'unknown'} bytes, elapsed=${Date.now() - startedAt}ms, url=${url}`;
        if (!err.retryable || attempt >= maxAttempts) {
          Logger.critical('DOWNLOAD', `Download failed, ${summary}`, err);
          throw err;
        }
        Logger.log('DOWNLOAD', `Attempt failed, retrying, ${summary}`, err);
        await sleep(retryDelayMs);
      }
    }
  }

  /**
   * 完整地试一次，返回收到的字节数。
   * 连接阶段的超时按网络不通处理，接收阶段的卡死按下载太慢处理，两段计时都受截止时刻约束。
   */
  private async tryOnce(
    url: string,
    dest: string,
    onProgress: (progress: DownloadProgress) => void,
    deadline: number
  ): Promise<number> {
    const { connectTimeoutMs, stallTimeoutMs } = this.rules;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** 计时器到点时记下它认定的失败，中止之后在 catch 里原样抛出 */
    let failure: DownloadError | null = null;
    let handle: fs.promises.FileHandle | null = null;
    let received = 0;

    /**
     * 起一个计时器，到点中止请求并记下失败类别。
     * 计时时长取自身超时和剩余时间的较小值，截止时刻先到就按下载太慢处理并且不再试。
     */
    const arm = (
      timeoutMs: number,
      kind: DownloadErrorKind,
      reason: string
    ) => {
      const budgetMs = deadline - Date.now();
      const outOfBudget = budgetMs < timeoutMs;
      timer = setTimeout(
        () => {
          failure = outOfBudget
            ? new DownloadError('Time budget ran out', 'slow', false)
            : new DownloadError(reason, kind, true);
          controller.abort();
        },
        Math.max(0, Math.min(timeoutMs, budgetMs))
      );
    };
    const disarm = (): void => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    try {
      arm(
        connectTimeoutMs,
        'network',
        `No response headers within ${connectTimeoutMs}ms`
      );
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new DownloadError(
          `HTTP ${response.status}`,
          'server',
          isTransient(response.status)
        );
      }
      const total = contentLength(response);
      disarm();
      const body = response.body;
      if (!body) {
        throw new DownloadError('Response has no body', 'server', false);
      }

      try {
        handle = await fs.promises.open(dest, 'w');
      } catch (err) {
        throw writeFailed(dest, err);
      }
      onProgress({ received: 0, total });

      const reader = body.getReader();
      for (;;) {
        arm(stallTimeoutMs, 'slow', `No data for ${stallTimeoutMs}ms`);
        const { done, value } = await reader.read();
        disarm();
        if (done) break;
        received += value.byteLength;
        try {
          await handle.write(value);
        } catch (err) {
          throw writeFailed(dest, err);
        }
        onProgress({ received, total });
      }
      return received;
    } catch (err) {
      // 中止连接，没读完的正文不再占着连接
      controller.abort();
      throw failure ?? toNetworkError(err);
    } finally {
      disarm();
      await handle?.close().catch(() => undefined);
    }
  }
}

/** 服务器是不是临时出错，再请求一次有希望成功 */
function isTransient(status: number): boolean {
  return status >= 500 || TRANSIENT_STATUS.has(status);
}

/**
 * 把请求和读流冒出来的错误归成网络问题，再试一次有希望成功。
 * 已经是 DownloadError 的原样返回，写盘和状态码的结论不能被这里盖掉。
 */
function toNetworkError(err: unknown): DownloadError {
  if (err instanceof DownloadError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new DownloadError(message, 'network', true, { cause: err });
}
