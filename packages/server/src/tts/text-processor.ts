/**
 * @fileoverview TTS text processing: rule-based cleaning + optional LLM compression/translation.
 *
 * Pipeline: cleanText() → threshold/language check → at most one LLM call → fallback to cleaned text.
 * Fixed instructions live in agent/prompt/tts-*.txt as the system prompt; the dynamic
 * compress-threshold instruction and the raw text form the user message.
 * All prompt files are written in English for maximum LLM comprehension accuracy.
 */

import { Logger } from '../util/logger.js';
import { errorMessage } from '../util/errors.js';
import { streamSingleTurn } from '../agent/llm-single-call.js';
import { loadTtsConfig } from './store.js';
import TTS_COMPRESS_PROMPT from '../agent/prompt/tts-compress.txt';
import TTS_ZH_PROMPT from '../agent/prompt/tts-zh.txt';
import TTS_EN_PROMPT from '../agent/prompt/tts-en.txt';
import TTS_JA_PROMPT from '../agent/prompt/tts-ja.txt';
import TTS_GENERIC_PROMPT from '../agent/prompt/tts-generic.txt';

/**
 * Rule-based text cleaning: strip Markdown, code blocks, HTML tags, emoji, and normalize whitespace.
 */
export function cleanText(text: string): string {
  let out = text;

  out = out.replace(/```[\s\S]*?```/g, '');
  out = out.replace(/`([^`]+)`/g, '$1');

  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  out = out.replace(/#{1,6}\s+/g, '');
  out = out.replace(/(\*{1,3}|_{1,3})(.+?)\1/g, '$2');

  out = out.replace(/<[^>]+>/g, '');

  out = out.replace(
    // eslint-disable-next-line no-misleading-character-class -- 刻意匹配 ZWJ 与 keycap 组合字符本身
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
    ''
  );

  out = out.replace(/---+/g, '');
  out = out.replace(/\n{2,}/g, '\n');
  out = out.replace(/[ \t]+/g, ' ');

  return out.trim();
}

/**
 * Process text for TTS playback.
 *
 * - Always applies rule-based cleaning.
 * - If text is within threshold AND no target language → returns cleaned text immediately.
 * - Otherwise calls the session's LLM once (compress to threshold + translate if needed).
 * - On LLM failure, falls back to cleaned text.
 *
 * @param text - Raw assistant message text
 * @param options - Processing options
 * @returns Text ready for TTS synthesis
 */
export async function processTextForTTS(
  text: string,
  options: {
    language?: string;
    provider: string;
    modelId: string;
  }
): Promise<string> {
  const cleaned = cleanText(text);

  const threshold = loadTtsConfig().summaryThreshold;

  const needCompress = cleaned.length > threshold;
  const needTranslate = !!options.language && options.language !== 'default';

  Logger.log('TTS', 'Processing text', {
    originalText: text,
    originalLength: text.length,
    cleanedText: cleaned,
    cleanedLength: cleaned.length,
    threshold,
    language: options.language,
    needCompress,
    needTranslate,
  });

  if (!needCompress && !needTranslate) {
    Logger.log('TTS', 'Text within threshold, no LLM needed', {
      method: 'cleaned',
      resultText: cleaned,
      resultLength: cleaned.length,
    });
    return cleaned;
  }

  const systemPrompt = selectSystemPrompt(
    needTranslate ? options.language : undefined
  );
  const userMessage = buildUserMessage(cleaned, threshold, needCompress);

  let result = '';
  try {
    result = await streamSingleTurn(
      userMessage,
      systemPrompt,
      options.provider,
      options.modelId
    );
  } catch (err) {
    Logger.log('TTS', 'LLM generation failed', { error: errorMessage(err) });
  }

  if (!result) {
    Logger.log('TTS', 'LLM failed, using cleaned text as fallback', {
      method: 'fallback',
      resultText: cleaned,
      resultLength: cleaned.length,
    });
    return cleaned;
  }

  const final = stripThink(result);
  Logger.log('TTS', 'Text processed by LLM', {
    method: 'llm',
    originalText: cleaned,
    resultText: final,
    originalLength: cleaned.length,
    resultLength: final.length,
    compressionRatio:
      cleaned.length > 0
        ? `${Math.round((final.length / cleaned.length) * 100)}%`
        : 'N/A',
  });

  return final;
}

/** Dedicated translation prompts per known language */
const TRANSLATE_PROMPTS: Record<string, string> = {
  zh: TTS_ZH_PROMPT,
  en: TTS_EN_PROMPT,
  ja: TTS_JA_PROMPT,
};

/**
 * Select the system prompt: compress-only template without a target language,
 * dedicated template for known languages, generic template with the language
 * name filled in otherwise.
 *
 * @param language - Target language; undefined or 'default' means no translation
 */
function selectSystemPrompt(language?: string): string {
  if (!language || language === 'default') return TTS_COMPRESS_PROMPT;
  return (
    TRANSLATE_PROMPTS[language] ??
    TTS_GENERIC_PROMPT.replace('{{language}}', language)
  );
}

/**
 * Build the user message: the dynamic compress-threshold instruction when over
 * threshold, followed by the text to process.
 *
 * @param text - Cleaned text
 * @param threshold - Character count that triggers compression
 * @param needCompress - Whether compression is needed
 */
function buildUserMessage(
  text: string,
  threshold: number,
  needCompress: boolean
): string {
  const parts: string[] = [];
  if (needCompress) {
    parts.push(
      `Compress the content to under ${threshold} characters while preserving key information.`
    );
  }
  parts.push('Original text:', text);
  return parts.join('\n');
}

function stripThink(raw: string): string {
  return raw.replace(/<think[\s\S]*?<\/think>/g, '').trim();
}
