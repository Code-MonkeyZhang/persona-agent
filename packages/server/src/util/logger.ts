/**
 * @fileoverview Logger utility for persona-agent server.
 *
 * Provides file-based logging with category, message, and optional data support.
 * Automatically enriches logs with human-readable names when agentId/sessionId
 * are present in the data object.
 * The log file rolls over at a size cap instead of being cleared on startup,
 * and the critical method writes even when logging is disabled.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { format } from 'date-fns';
import type { SessionManager } from '../session/session-manager.js';
import { getAgentConfig } from '../agent/agent-config-store.js';

const LOG_FILENAME = 'agent-server.log';
/** 当前文件写满后改成的名字，只保留这一代旧文件 */
const ROTATED_LOG_FILENAME = 'agent-server.1.log';
/** 单个日志文件的体积上限 */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

type SessionManagersMap = Map<string, SessionManager>;

interface LogData {
  agentId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * Static logger class for writing logs to file.
 */
export class Logger {
  private static logFile: string | null = null;
  private static enabled = false;
  private static sessionManagers: SessionManagersMap | null = null;
  /** 当前日志文件已经写入的字节数，滚动时归零 */
  private static writtenBytes = 0;

  /**
   * Initialize the logger.
   * 已有的日志文件接着往下写，不再每次启动清空。
   * @param logDir - Log directory path (caller ensures it exists)
   * @param enabled - Whether logging is enabled
   * @returns The path to the log file
   */
  static initialize(logDir: string, enabled: boolean): string {
    this.enabled = enabled;
    this.logFile = path.join(logDir, LOG_FILENAME);
    this.writtenBytes = fs.existsSync(this.logFile)
      ? fs.statSync(this.logFile).size
      : 0;

    return this.logFile;
  }

  /**
   * Enable or disable logging at runtime.
   * @param enabled - Whether logging should be enabled
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Inject session managers reference for name lookup.
   * Called after sessionManagers are initialized in http-server.ts.
   * @param sessionManagers - Map of agentId to SessionManager
   */
  static setSessionManagers(sessionManagers: SessionManagersMap): void {
    this.sessionManagers = sessionManagers;
  }

  /**
   * Write a log entry to the log file.
   * @param category - Log category (e.g., 'HTTP', 'SERVER', 'LLM')
   * @param message - Log message
   * @param data - Optional additional data to log. If contains agentId or sessionId,
   *               will auto-enrich with agent name and session title.
   */
  static log(category: string, message: string, data?: unknown): void {
    if (!this.enabled) return;
    this.write(category, message, data);
  }

  /**
   * 记录不管日志开关都要留下的失败。
   * 环境安装和商城下载这类关键动作失败时用它，开关关着也要留下排查的依据。
   */
  static critical(category: string, message: string, data?: unknown): void {
    this.write(category, message, data);
  }

  /**
   * 把一条日志追加到文件，追加后要超过上限就先把当前文件改名让位。
   */
  private static write(
    category: string,
    message: string,
    data?: unknown
  ): void {
    const logFile = this.logFile;
    if (!logFile) return;

    const timestamp = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    const enrichedData = this.enrichData(data);

    let formattedData = '';
    if (enrichedData !== undefined && enrichedData !== null) {
      if (typeof enrichedData === 'string') {
        formattedData = `\n${enrichedData
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')}`;
      } else if (enrichedData instanceof Error) {
        formattedData = this.formatError(enrichedData);
      } else {
        formattedData = `\n${JSON.stringify(enrichedData, null, 2)}`;
      }
    }

    const fileEntry = `[${timestamp}] [${category}] ${message}${formattedData}\n`;
    const entryBytes = Buffer.byteLength(fileEntry);

    if (this.writtenBytes + entryBytes > MAX_LOG_BYTES) {
      this.rotate(logFile);
    }
    fs.appendFileSync(logFile, fileEntry);
    this.writtenBytes += entryBytes;
  }

  /**
   * 当前文件写满了，把它改名成上一代，只保留这一代旧文件。
   * 改名失败时照旧写当前文件，日志不断比守住上限更重要。
   */
  private static rotate(logFile: string): void {
    try {
      fs.renameSync(
        logFile,
        path.join(path.dirname(logFile), ROTATED_LOG_FILENAME)
      );
    } catch {
      // 上一代文件被别的程序占着时改不了名
    }
    this.writtenBytes = 0;
  }

  /**
   * 把错误展开成要写进日志的缩进行。
   * 消息之外还要写出自有的附加属性和 cause 链，网络错误的原因就挂在这两处，只写消息的话剩下的只有一句连接失败。
   */
  private static formatError(error: Error): string {
    const lines: string[] = [];
    let indent = '  ';
    for (
      let current: Error | undefined = error;
      current;
      current = current.cause instanceof Error ? current.cause : undefined
    ) {
      lines.push(`${indent}message: ${current.message}`);
      for (const [key, value] of Object.entries(current)) {
        if (key !== 'message') lines.push(`${indent}${key}: ${String(value)}`);
      }
      indent += '  ';
    }
    lines.push(`  stack: ${error.stack}`);
    return `\n${lines.join('\n')}`;
  }

  /**
   * Enrich log data with human-readable names for agentId and sessionId.
   * @param data - Original log data
   * @returns Enriched data with agentName and sessionTitle fields added
   */
  private static enrichData(data: unknown): unknown {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }

    // Error 对象的 message / stack 是不可枚举属性，
    // 用 { ...data } 展开会丢失。直接返回让 log() 的 Error 分支处理。
    if (data instanceof Error) {
      return data;
    }

    const logData = data as LogData;
    const result: Record<string, unknown> = { ...logData };

    if (logData.agentId) {
      const agentConfig = getAgentConfig(logData.agentId);
      result['agentId'] = logData.agentId;
      if (agentConfig?.name) {
        result['agentName'] = agentConfig.name;
      }
    }

    if (logData.sessionId && this.sessionManagers) {
      result['sessionId'] = logData.sessionId;
      for (const sessionManager of this.sessionManagers.values()) {
        const session = sessionManager.getSession(logData.sessionId);
        if (session?.title) {
          result['sessionTitle'] = session.title;
          break;
        }
      }
    }

    return result;
  }
}
