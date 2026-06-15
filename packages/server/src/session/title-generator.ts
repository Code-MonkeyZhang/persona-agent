/**
 * @fileoverview Auto-generate session titles from the first user message.
 *
 * Calls the LLM with a dedicated system prompt (no tools) to produce a short
 * title, then cleans up the raw output (strips think tags, truncates, etc.).
 */

import { Logger } from '../util/logger.js';
import { errorMessage } from '../util/errors.js';
import { streamSingleTurn } from '../agent/llm-single-call.js';
import TITLE_SYSTEM_PROMPT from '../agent/prompt/title.txt';

/**
 * Post-process the raw LLM output into a clean title string.
 *
 * Steps: strip <think/> tags, take first non-empty line, truncate to 100 chars.
 * Returns empty string when the output contains nothing useful.
 */
function cleanTitle(raw: string): string {
  const withoutThink = raw.replace(/<think[\s\S]*?<\/think>/g, '');
  const firstLine = withoutThink.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return '';
  const trimmed = firstLine.trim();
  return trimmed.length > 100 ? `${trimmed.slice(0, 100)}...` : trimmed;
}

/**
 * Generate a session title based on the user's first message.
 * Reuses the same provider/model/apiKey that the session is configured with.
 *
 * @returns The generated title, or an empty string if failed.
 */
export async function generateTitle(
  userMessage: string,
  provider: string,
  modelId: string
): Promise<string> {
  try {
    const raw = await streamSingleTurn(
      userMessage,
      TITLE_SYSTEM_PROMPT,
      provider,
      modelId
    );
    return cleanTitle(raw);
  } catch (err) {
    Logger.log('TITLE', 'Generation failed', { error: errorMessage(err) });
    return '';
  }
}
