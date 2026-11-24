/**
 * @file 陪伴演出的动作枚举与气泡名单，服务端工具链与两端渲染层共用的唯一事实源
 * 改名单等于改代码，两端随发版生效
 */

/** 身体动作的枚举名，命名沿用 LingChat 的构词法 */
export const MOTION_NAMES = [
  'happy-bounce',
  'angry-stomp',
  'heart-beat',
  'sad-sink',
] as const;

export type MotionName = (typeof MOTION_NAMES)[number];

/** 动作的中文观感，工具说明、回话与校验报错拼装时消费 */
export const MOTION_CN: Record<MotionName, string> = {
  'happy-bounce': '开心弹跳',
  'angry-stomp': '生气跺脚',
  'heart-beat': '心动心跳',
  'sad-sink': '难过下沉',
};

/** AI 可选的情绪气泡名单，英文语义名即参数值，思考气泡不在其中，见 THINKING_BUBBLE */
export const BUBBLE_NAMES = [
  'happy',
  'flutter',
  'tears',
  'angry',
  'doubt',
  'sweat',
  'sigh',
  'shy',
  'surprise',
  'fluster',
  'nervous',
  'embarrassed',
  'notice',
  'chat',
  'angry2',
] as const;

export type BubbleName = (typeof BUBBLE_NAMES)[number];

/** 气泡的中文含义，工具说明、回话与校验报错拼装时消费 */
export const BUBBLE_CN: Record<BubbleName, string> = {
  happy: '高兴',
  flutter: '心动',
  tears: '流泪',
  angry: '生气',
  doubt: '疑问',
  sweat: '流汗',
  sigh: '叹气',
  shy: '害羞',
  surprise: '惊讶',
  fluster: '慌乱',
  nervous: '紧张',
  embarrassed: '难为情',
  notice: '察觉',
  chat: '聊天',
  angry2: '生气2',
};

/** 思考气泡的名字，不进 AI 可选名单，由客户端的生成相位驱动 */
export const THINKING_BUBBLE = 'thinking';

/** 气泡层能承载的气泡名，情绪气泡或思考气泡，两端资源索引以它为键 */
export type LayerBubbleName = BubbleName | typeof THINKING_BUBBLE;

/**
 * 值是否为合法的动作枚举名
 * @param value 待判定的任意值
 */
export function isMotionName(value: unknown): value is MotionName {
  return (MOTION_NAMES as readonly string[]).includes(value as string);
}

/**
 * 值是否为气泡名单内的名字
 * @param value 待判定的任意值
 */
export function isBubbleName(value: unknown): value is BubbleName {
  return (BUBBLE_NAMES as readonly string[]).includes(value as string);
}

/** 一次 show_pose 调用的三参数，立绘、动作与气泡，三者至少一个 */
export interface ShowPoseParams {
  pose?: string;
  motion?: MotionName;
  bubble?: BubbleName;
}

/**
 * 从一次成功的 show_pose 调用参数里收窄出合法的三参数
 * pose 取非空字符串，motion 与 bubble 不在名单里的值按缺省处理，三值全空返回 undefined
 * @param args 单次 show_pose 调用的参数对象
 */
export function successfulShowPose(
  args: Record<string, unknown> | undefined
): ShowPoseParams | undefined {
  const poseArg: unknown = args?.['pose'];
  const pose = typeof poseArg === 'string' && poseArg ? poseArg : undefined;
  const params: ShowPoseParams = {};
  if (pose) params.pose = pose;
  const motion = args?.['motion'];
  if (isMotionName(motion)) params.motion = motion;
  const bubble = args?.['bubble'];
  if (isBubbleName(bubble)) params.bubble = bubble;
  return pose || params.motion || params.bubble ? params : undefined;
}
