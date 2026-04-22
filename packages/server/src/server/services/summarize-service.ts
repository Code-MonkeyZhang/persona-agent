/**
 * @fileoverview LLM-based summarization service for TTS voice playback.
 *
 * Takes a long assistant message and produces a concise spoken-friendly
 * summary using the session's current model (provider + modelId + apiKey).
 * Follows the same streaming pattern as title-generator.ts.
 */

import { stream, getModel, type KnownProvider } from '@mariozechner/pi-ai';
import { getAuth } from '../../auth/index.js';
import { Logger } from '../../util/logger.js';
import SUMMARIZE_SYSTEM_PROMPT from '../../agent/prompt/summarize.txt';

/**
 * Strip <think/> reasoning tags from model output.
 */
function cleanThinking(raw: string): string {
  return raw.replace(/<think[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Summarize a long assistant message for TTS playback.
 *
 * Uses the session's actual model (the one the user is currently chatting with)
 * to generate the summary, not the agent's defaultModel.
 *
 * @param text - The assistant message to summarize
 * @param provider - LLM provider from session.model
 * @param modelId - Model ID from session.model
 * @returns Summarized text, or empty string on failure
 */
export async function summarizeText(
  text: string,
  provider: string,
  modelId: string
): Promise<string> {
  const auth = getAuth(provider as KnownProvider);
  if (!auth) {
    Logger.log('SUMMARIZE', `No auth for provider: ${provider}`);
    return '';
  }

  const model = getModel(
    provider as KnownProvider,
    modelId as Parameters<typeof getModel>[1]
  );
  if (!model) {
    Logger.log('SUMMARIZE', `Model not found: ${provider}/${modelId}`);
    return '';
  }

  const context = {
    systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user' as const,
        content: text,
        timestamp: Date.now(),
      },
    ],
  };

  let raw = '';
  try {
    const eventStream = stream(model, context, { apiKey: auth.apiKey });
    for await (const event of eventStream) {
      if (event.type === 'text_delta') {
        raw += (event as { delta: string }).delta;
      }
      if (event.type === 'done' || event.type === 'error') break;
    }
  } catch (err) {
    Logger.log('SUMMARIZE', 'Generation failed', {
      error: (err as Error).message,
    });
    return '';
  }

  return cleanThinking(raw);
}
