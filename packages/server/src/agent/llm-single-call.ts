/**
 * @fileoverview 单步流式 LLM 调用工具。
 *
 * 供标题生成、摘要、TTS 文本处理等需要"调用一次 LLM 并收集完整文本"的场景共用。
 * 失败时抛出异常，由调用方自行 try/catch 处理。
 */

import type { Usage } from '@earendil-works/pi-ai';
import { getAuth } from '../auth/index.js';
import { models } from './pi-models.js';

/** 单步调用错误分类，供压缩链判定是否可重试 */
export type StreamCallErrorClass =
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'auth'
  | 'policy'
  | 'unknown';

/** 单步调用错误，class 字段携带分类依据 */
export class StreamCallError extends Error {
  readonly class: StreamCallErrorClass;

  constructor(message: string, errorClass: StreamCallErrorClass) {
    super(message);
    this.name = 'StreamCallError';
    this.class = errorClass;
  }
}

/** 单步调用的详细结果，usage 是 done 事件报回的用量，未报数为 null */
export interface StreamCallOutcome {
  text: string;
  usage: Usage | null;
}

/**
 * 按错误文本与状态码归类单步调用失败。
 * 各 provider 文案不一，先覆盖主流几类，认不出默认 unknown。
 */
function classifyError(message: string): StreamCallErrorClass {
  const text = message.toLowerCase();
  if (/rate.?limit|429|too many requests|quota/.test(text)) {
    return 'rate_limit';
  }
  if (/401|403|unauthorized|forbidden|api.?key|auth/.test(text)) {
    return 'auth';
  }
  if (/policy|content (filter|moderation)|safety/.test(text)) {
    return 'policy';
  }
  if (/network|timeout|econn|fetch failed|socket|dns/.test(text)) {
    return 'network';
  }
  if (/\b5\d\d\b|server error|internal error|overloaded/.test(text)) {
    return 'server';
  }
  return 'unknown';
}

/**
 * 调用 LLM 进行单步流式生成，收集完整文本与用量返回。
 *
 * 内部完成 auth 检查、model 查找和流式文本收集。
 * 流上 error 事件转抛 {@link StreamCallError}，done 事件的 usage
 * 随结果携带；auth 不存在或 model 未找到同步抛普通 Error。
 * 不做日志记录，由调用方在 catch 中决定如何处理。
 *
 * @param userMessage - 用户消息内容
 * @param systemPrompt - 系统提示词
 * @param provider - LLM 提供商
 * @param modelId - 模型 ID
 * @returns 完整回复文本与报回的用量
 * @throws StreamCallError 流式请求出错时抛出，class 供重试分类
 * @throws Error auth 不存在或 model 未找到时抛出
 */
export async function streamSingleStepOutcome(
  userMessage: string,
  systemPrompt: string,
  provider: string,
  modelId: string
): Promise<StreamCallOutcome> {
  const auth = getAuth(provider);
  if (!auth) throw new Error(`No auth for provider: ${provider}`);

  const model = models.getModel(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const context = {
    systemPrompt,
    messages: [
      {
        role: 'user' as const,
        content: userMessage,
        timestamp: Date.now(),
      },
    ],
  };

  let raw = '';
  let usage: Usage | null = null;
  const eventStream = models.stream(model, context, { apiKey: auth.apiKey });
  for await (const event of eventStream) {
    if (event.type === 'text_delta') {
      raw += (event as { delta: string }).delta;
    }
    if (event.type === 'error') {
      const errorEvent = event as {
        reason?: string;
        error?: { errorMessage?: string; stopReason?: string };
      };
      throw new StreamCallError(
        errorEvent.error?.errorMessage ||
          errorEvent.error?.stopReason ||
          errorEvent.reason ||
          'LLM stream error',
        classifyError(
          errorEvent.error?.errorMessage ||
            errorEvent.error?.stopReason ||
            errorEvent.reason ||
            'LLM stream error'
        )
      );
    }
    if (event.type === 'done') {
      usage = (event as { message: { usage: Usage } }).message.usage;
      break;
    }
  }
  return { text: raw, usage };
}

/**
 * 调用 LLM 进行单步流式生成，只收集完整文本。
 *
 * {@link streamSingleStepOutcome} 的薄包装，供标题生成与 TTS 处理等
 * 只关心文本的既有调用点使用。
 */
export async function streamSingleStep(
  userMessage: string,
  systemPrompt: string,
  provider: string,
  modelId: string
): Promise<string> {
  const { text } = await streamSingleStepOutcome(
    userMessage,
    systemPrompt,
    provider,
    modelId
  );
  return text;
}
