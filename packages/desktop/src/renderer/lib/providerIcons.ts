/**
 * @file 供应商品牌图标注册表
 * 来源：@lobehub/icons npm 包（MIT 协议），React 组件直接渲染、支持 tree-shaking
 * 键 = 供应商 id（与 server 白名单 SUPPORTED_PROVIDERS 对齐，CN 变体与 codex 复用母品牌图标）
 * 优先使用 Color 彩色变体，上游无彩色版的品牌用 Mono 单色（chip 内锁深色保证浅底可读）
 * 查不到的供应商由 ProviderMark 回退首字母 monogram，保证不破相
 */
import type { ComponentType } from 'react';
import {
  Anthropic,
  Gemini,
  OpenAI,
  XAI,
  OpenRouter,
  ZAI,
  Minimax,
  DeepSeek,
  Moonshot,
  HuggingFace,
  Kimi,
  Codex,
  OpenCode,
  XiaomiMiMo,
} from '@lobehub/icons';

interface ProviderIconEntry {
  /** lobe-icons 图标组件，Mono 或 Color 变体 */
  Icon: ComponentType<{ size?: number | string; color?: string }>;
  /** Mono 单色图标需要锁深色，Color 彩色图标自带配色 */
  mono: boolean;
  /** 自带深色底的图标（如 Kimi 黑底白字），chip 背景跟随而非默认浅灰 */
  background?: string;
}

export const PROVIDER_ICONS: Record<string, ProviderIconEntry> = {
  anthropic: { Icon: Anthropic, mono: true },
  google: { Icon: Gemini.Color, mono: false },
  openai: { Icon: OpenAI, mono: true },
  xai: { Icon: XAI, mono: true },
  openrouter: { Icon: OpenRouter, mono: true },
  zai: { Icon: ZAI, mono: true },
  minimax: { Icon: Minimax.Color, mono: false },
  'minimax-cn': { Icon: Minimax.Color, mono: false },
  'opencode-go': { Icon: OpenCode, mono: true },
  'kimi-coding': { Icon: Kimi.Color, mono: false, background: '#000' },
  deepseek: { Icon: DeepSeek.Color, mono: false },
  huggingface: { Icon: HuggingFace.Color, mono: false },
  'openai-codex': { Icon: Codex.Color, mono: false },
  moonshotai: { Icon: Moonshot, mono: true },
  'moonshotai-cn': { Icon: Moonshot, mono: true },
  xiaomi: { Icon: XiaomiMiMo, mono: true },
  'xiaomi-token-plan-cn': { Icon: XiaomiMiMo, mono: true },
};
