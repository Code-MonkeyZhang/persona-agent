/**
 * @fileoverview 单轮流式 LLM 调用工具。
 *
 * 供标题生成、摘要、TTS 文本处理等需要"调用一次 LLM 并收集完整文本"的场景共用。
 * 失败时抛出异常，由调用方自行 try/catch 处理。
 */

import { stream, getModel, type KnownProvider } from '@earendil-works/pi-ai';
import { getAuth } from '../auth/index.js';

/**
 * 调用 LLM 进行单轮流式对话，收集完整文本返回。
 *
 * 内部完成 auth 检查、model 查找和流式文本收集。
 * 任何步骤失败时抛出异常，
 * 不做日志记录，由调用方在 catch 中决定如何处理。
 *
 * @param userMessage - 用户消息内容
 * @param systemPrompt - 系统提示词
 * @param provider - LLM 提供商
 * @param modelId - 模型 ID
 * @returns LLM 生成的完整文本
 * @throws auth 不存在、model 未找到、或流式请求出错时抛出 Error
 */
export async function streamSingleTurn(
  userMessage: string,
  systemPrompt: string,
  provider: string,
  modelId: string
): Promise<string> {
  const auth = getAuth(provider as KnownProvider);
  if (!auth) throw new Error(`No auth for provider: ${provider}`);

  const model = getModel(
    provider as KnownProvider,
    modelId as Parameters<typeof getModel>[1]
  );
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
  const eventStream = stream(model, context, { apiKey: auth.apiKey });
  for await (const event of eventStream) {
    if (event.type === 'text_delta') {
      raw += (event as { delta: string }).delta;
    }
    if (event.type === 'done' || event.type === 'error') break;
  }
  return raw;
}
