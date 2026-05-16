/**
 * @fileoverview TTS text processing: rule-based cleaning + optional LLM compression/translation.
 *
 * Pipeline: cleanText() → threshold/language check → at most one LLM call → fallback to cleaned text.
 */

import { stream, getModel, type KnownProvider } from '@mariozechner/pi-ai';
import { getAuth } from '../auth/index.js';
import { Logger } from '../util/logger.js';
import { loadConfig } from '../config/index.js';
import { getConfigPath } from '../util/paths.js';

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
 * 1. Always applies rule-based cleaning.
 * 2. If text is within threshold AND no target language → returns cleaned text immediately.
 * 3. Otherwise calls the session's LLM once (compress to threshold + translate if needed).
 * 4. On LLM failure, falls back to cleaned text.
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

  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  const threshold = config.tts?.summaryThreshold ?? 200;

  const needCompress = cleaned.length > threshold;
  const needTranslate = !!options.language && options.language !== 'default';

  Logger.log('TTS', 'Processing text', {
    originalText: text,
    originalLength: text.length,
    cleanedText: cleaned,
    cleanedLength: cleaned.length,
    threshold,
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

  const prompt = buildPrompt(cleaned, {
    threshold,
    language: options.language,
    needCompress,
    needTranslate,
  });

  const result = await callLLM(prompt, options.provider, options.modelId);
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

function buildPrompt(
  text: string,
  opts: {
    threshold: number;
    language?: string;
    needCompress: boolean;
    needTranslate: boolean;
  }
): string {
  if (opts.needTranslate && opts.language) {
    return buildTranslatePrompt(text, {
      threshold: opts.threshold,
      language: opts.language,
      needCompress: opts.needCompress,
    });
  }

  return buildCompressOnlyPrompt(text, opts.threshold, opts.needCompress);
}

function buildCompressOnlyPrompt(
  text: string,
  threshold: number,
  needCompress: boolean
): string {
  const parts: string[] = [
    'You are a text-to-speech processing assistant. Process the following text to make it suitable for spoken narration.',
  ];

  if (needCompress) {
    parts.push(
      `Compress the content to under ${threshold} characters while preserving key information.`
    );
  }

  parts.push(
    'Rules:',
    '- Output plain text only, no explanations',
    '- Preserve key facts and numbers',
    '- Make the text natural and fluent for spoken narration',
    '',
    'Original text:',
    text
  );

  return parts.join('\n');
}

/**
 * Build a language-specific translation prompt for TTS text processing.
 * All prompts are written in English for maximum LLM comprehension accuracy.
 */
function buildTranslatePrompt(
  text: string,
  opts: {
    threshold: number;
    language: string;
    needCompress: boolean;
  }
): string {
  switch (opts.language) {
    case 'zh':
      return buildChinesePrompt(text, opts);
    case 'en':
      return buildEnglishPrompt(text, opts);
    case 'ja':
      return buildJapanesePrompt(text, opts);
    default:
      return buildGenericTranslatePrompt(text, opts, opts.language);
  }
}

function buildChinesePrompt(
  text: string,
  opts: { threshold: number; needCompress: boolean }
): string {
  const parts: string[] = [
    'You are a text-to-speech processing assistant. Translate and adapt the following text into natural Chinese (Mandarin) for spoken narration.',
  ];

  if (opts.needCompress) {
    parts.push(
      `Compress the content to under ${opts.threshold} characters while preserving key information.`
    );
  }

  parts.push(
    'Rules:',
    '- Output plain text only, no explanations',
    '- Use natural, conversational Chinese (Mandarin)',
    '- Keep foreign proper nouns in their original form, add Chinese annotation when necessary',
    '- Preserve key facts and numbers',
    '',
    'Original text:',
    text
  );

  return parts.join('\n');
}

function buildEnglishPrompt(
  text: string,
  opts: { threshold: number; needCompress: boolean }
): string {
  const parts: string[] = [
    'You are a text-to-speech processing assistant. Translate and adapt the following text into natural English for spoken narration.',
  ];

  if (opts.needCompress) {
    parts.push(
      `Compress the content to under ${opts.threshold} characters while preserving key information.`
    );
  }

  parts.push(
    'Rules:',
    '- Output plain text only, no explanations',
    '- Use natural, conversational English',
    '- Keep proper nouns in their original form when appropriate',
    '- Preserve key facts and numbers',
    '',
    'Original text:',
    text
  );

  return parts.join('\n');
}

function buildJapanesePrompt(
  text: string,
  opts: { threshold: number; needCompress: boolean }
): string {
  const parts: string[] = [
    'You are a text-to-speech processing assistant. Translate and adapt the following text into natural Japanese for spoken narration. your prompt will directly send to TTS engine, so do not generate text that is hard to process or repeat it self',
  ];

  if (opts.needCompress) {
    parts.push(
      `Compress the content to under ${opts.threshold} characters while preserving key information.`
    );
  }

  parts.push(
    'Rules:',
    '- Output plain text only, no explanations',
    '- Convert difficult kanji compounds to hiragana/katakana where appropriate do not use () to repeat those words',
    '- Transliterate ALL English and foreign words into katakana (e.g. computer→コンピュータ, AI→エーアイ, API→エーピーアイ)',
    '- Transliterate foreign proper nouns into katakana (e.g. New York→ニューヨーク)',
    '- Use natural, conversational Japanese suitable for spoken narration',
    '- Preserve key facts and numbers',
    '',
    'Original text:',
    text
  );

  return parts.join('\n');
}

function buildGenericTranslatePrompt(
  text: string,
  opts: { threshold: number; needCompress: boolean },
  language: string
): string {
  const parts: string[] = [
    `You are a text-to-speech processing assistant. Translate and adapt the following text into natural ${language} for spoken narration.`,
  ];

  if (opts.needCompress) {
    parts.push(
      `Compress the content to under ${opts.threshold} characters while preserving key information.`
    );
  }

  parts.push(
    'Rules:',
    '- Output plain text only, no explanations',
    '- Use natural, conversational language suitable for spoken narration',
    '- Preserve key facts and numbers',
    '',
    'Original text:',
    text
  );

  return parts.join('\n');
}

/**
 * Call the session's LLM with a single user message and collect the full response.
 * Returns empty string on any failure (auth missing, model not found, stream error).
 */
async function callLLM(
  prompt: string,
  provider: string,
  modelId: string
): Promise<string> {
  const auth = getAuth(provider as KnownProvider);
  if (!auth) {
    Logger.log('TTS', `No auth for provider: ${provider}`);
    return '';
  }

  const model = getModel(
    provider as KnownProvider,
    modelId as Parameters<typeof getModel>[1]
  );
  if (!model) {
    Logger.log('TTS', `Model not found: ${provider}/${modelId}`);
    return '';
  }

  const context = {
    systemPrompt: '',
    messages: [
      {
        role: 'user' as const,
        content: prompt,
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
    Logger.log('TTS', 'LLM generation failed', {
      error: (err as Error).message,
    });
    return '';
  }

  return raw;
}

function stripThink(raw: string): string {
  return raw.replace(/<think[\s\S]*?<\/think>/g, '').trim();
}
