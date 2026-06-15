/**
 * @fileoverview LLM-based summarization service for TTS voice playback.
 *
 * Takes a long assistant message and produces a concise spoken-friendly
 * summary using the session's current model (provider + modelId + apiKey).
 */

import { Logger } from '../../util/logger.js';
import { errorMessage } from '../../util/errors.js';
import { streamSingleTurn } from '../../agent/llm-single-call.js';
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
  try {
    const raw = await streamSingleTurn(
      text,
      SUMMARIZE_SYSTEM_PROMPT,
      provider,
      modelId
    );
    return cleanThinking(raw);
  } catch (err) {
    Logger.log('SUMMARIZE', 'Generation failed', { error: errorMessage(err) });
    return '';
  }
}
