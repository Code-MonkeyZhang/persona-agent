/**
 * @file 模型品牌图标映射表
 * 规则、关键词、顺序照抄 @lobehub/icons 官方 modelConfig（features/modelConfig.js），
 * 仅收录白名单供应商涉及的家族——直接 import 官方表会静态引入全部 94 个品牌，tree-shaking 失效
 * 与供应商层（providerIcons）区分：模型图标代表产品本身，供应商图标代表接通渠道
 * 未命中回退供应商图标（见 ModelMark），再未命中走 monogram
 * 官方全用默认变体，本表保持彩色优先：有 Color 变体的用 Color，无色的用 Mono（chip 内锁深色）
 */
import type { ComponentType } from 'react';
import {
  OpenAI,
  GLMV,
  ZAI,
  ChatGLM,
  Claude,
  Anthropic,
  NanoBanana,
  Gemini,
  Gemma,
  Kimi,
  Qwen,
  Minimax,
  Grok,
  DeepSeek,
  XiaomiMiMo,
} from '@lobehub/icons';

export interface ModelIconRule {
  /**
   * 正则源串列表，官方锚点语法：^ 前缀、/ 路径段（如 openrouter 的 vendor/model）、- 连字符段
   * 对 modelId 小写后逐条 new RegExp(kw, 'i').test()，任一命中即选中本规则
   */
  keywords: string[];
  /** lobe-icons 图标组件，Mono 或 Color 变体 */
  Icon: ComponentType<{ size?: number | string; color?: string }>;
  /** Mono 单色图标需要锁深色，Color 彩色图标自带配色 */
  mono: boolean;
  /** 自带深色底的图标（如 Kimi 黑底白字），chip 背景跟随而非默认浅灰 */
  background?: string;
}

export const MODEL_ICON_RULES: ModelIconRule[] = [
  {
    // 官方为 gpt3/4/5、o1 系列传 type props 切换 logo 变体，但 v5.16.0 的 OpenAI 组件只解构 size/style，
    // props 会被透传成 DOM 未知属性，故合并为一条不传 props，渲染结果与官方一致
    keywords: [
      'gpt-3',
      'gpt-4',
      'gpt-5',
      'gpt-oss',
      'o1-',
      '^o1',
      '/o1',
      'o3-',
      '^o3',
      '/o3',
      'o4-',
      '^o4',
      '/o4',
      'text-embedding-',
      'tts-',
      'whisper-',
      'codex',
      'davinci',
      'babbage',
      'omni-moderation',
      'text-moderation',
      'computer-use',
      '^gpt-',
      '/gpt-',
      'openai',
    ],
    Icon: OpenAI,
    mono: true,
  },
  {
    keywords: ['^glm-(.*)v', '/glm-(.*)v', '-glm-(.*)v'],
    Icon: GLMV.Color,
    mono: false,
  },
  {
    keywords: [
      '^glm-5',
      '/glm-5',
      '/glm5',
      '-glm-4',
      '^glm-4',
      '/glm-4',
      '/glm4',
      '-glm-5',
    ],
    Icon: ZAI,
    mono: true,
  },
  {
    keywords: ['^glm-', '/glm-', 'chatglm', '-glm-'],
    Icon: ChatGLM.Color,
    mono: false,
  },
  { keywords: ['claude'], Icon: Claude.Color, mono: false },
  { keywords: ['anthropic'], Icon: Anthropic, mono: true },
  {
    keywords: [
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
      'gemini-\\d+(?:\\.\\d+)?-(?:flash(?:-lite)?|pro)-image(?:-preview)?(?::|$)',
      'nanobanana',
      'nano-banana',
    ],
    Icon: NanoBanana.Color,
    mono: false,
  },
  { keywords: ['gemini'], Icon: Gemini.Color, mono: false },
  { keywords: ['gemma'], Icon: Gemma.Color, mono: false },
  // 官方对 kimi/moonshot 系列给 Moonshot 火箭标，此处改为产品标：Kimi 黑底白 K，k3 为官方没有的关键词补充
  {
    keywords: ['kimi', 'k3', 'moonshot'],
    Icon: Kimi.Color,
    mono: false,
    background: '#000',
  },
  {
    keywords: [
      'qwen',
      'qwq',
      'qvq',
      'wanx',
      'wan\\d/',
      'wan\\d\\.\\d-',
      'tongyi',
      'gte-rerank',
    ],
    Icon: Qwen.Color,
    mono: false,
  },
  {
    keywords: ['minimax', 'abab', '^image-'],
    Icon: Minimax.Color,
    mono: false,
  },
  { keywords: ['^grok-', '/grok-'], Icon: Grok, mono: true },
  { keywords: ['deepseek'], Icon: DeepSeek.Color, mono: false },
  { keywords: ['^mimo-', '/mimo-'], Icon: XiaomiMiMo, mono: true },
];

/** 模块加载时预编译正则，避免每次查询重复构造 */
const COMPILED_RULES = MODEL_ICON_RULES.map((rule) => ({
  ...rule,
  regexps: rule.keywords.map((kw) => new RegExp(kw, 'i')),
}));

/** 按 modelId 查模型图标（官方同款逻辑：自上而下任一关键词命中即停），未命中返回 null */
export function findModelIcon(modelId: string): ModelIconRule | null {
  const id = modelId.toLowerCase();
  for (const rule of COMPILED_RULES) {
    if (rule.regexps.some((re) => re.test(id))) {
      return rule;
    }
  }
  return null;
}
