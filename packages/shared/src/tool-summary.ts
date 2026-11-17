/**
 * @file 工具调用参数的摘要与凭据掩码纯函数，desktop 与 server 共用
 * 掩码先于截断执行，Bash 命令可能携带凭据，顺序不能反
 */

/**
 * 内置条目 id，顺序即工具页内置组的展示顺序。
 * built_in 前缀把内置与外部的名字空间结构性隔开，撞名从根上不可达。
 */
export const BUILTIN_TOOLSET_IDS = [
  'built_in_terminal',
  'built_in_files',
  'built_in_web',
  'built_in_pose',
  'built_in_memory',
] as const;

/** 立绘条目 id，可见性按 Agent 资产现算 */
export const POSE_TOOLSET_ID = 'built_in_pose';

/** 掩码替换用的固定星串，定长不泄露原始凭据长度 */
const MASK = '********';

/** 值形态的凭据正则清单，整段替换为固定星串 */
const SENSITIVE_VALUE_RES: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bgho_[A-Za-z0-9]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/g,
];

/** 键值对形态的凭据正则，键保留值替换 */
const SENSITIVE_PAIR_RE =
  /(\b(?:token|password|api_key)\b["']?\s*[:=]\s*)(["']?)[^\s"',}]+\2/gi;

/**
 * 对文本里的凭据形态打码，值形态整段替换，键值对形态保留键只换值
 * @param text 待打码的原文
 */
export function maskSensitive(text: string): string {
  let out = text;
  for (const re of SENSITIVE_VALUE_RES) {
    out = out.replace(re, MASK);
  }
  return out.replace(SENSITIVE_PAIR_RE, `$1$2${MASK}$2`);
}

/**
 * 文案截断，超上限裁到 max 减一并补省略号
 * @param text 原文
 * @param max 上限字符数
 */
export function trunc(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * 路径取 basename，结尾斜杠剥掉后取最后一段
 * @param path 原始路径
 */
export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || path;
}

/**
 * 取网址的主机名并去掉开头的 www，解析失败回退原文
 * @param url 原始网址
 */
function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 剥掉工具全名的条目前缀，返回短名。
 * 全名格式为条目id__短名，按第一个双下划线切分，无前缀的原样返回。
 * @param toolName 工具全名或短名
 */
export function shortToolName(toolName: string): string {
  const sep = toolName.indexOf('__');
  return sep === -1 ? toolName : toolName.slice(sep + 2);
}

/**
 * 把工具入参对象压成一句参数摘要，供时间线行动向句与事件广播复用
 * 摘要只取关键参数字段，缺参返回空串由调用方走文案回退，掩码先于截断执行
 * @param toolName 工具实名
 * @param toolInput 解析后的入参对象
 */
export function summarizeToolInput(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  if (!toolInput) return '';
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  let summary: string;
  switch (shortToolName(toolName)) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      summary = str(toolInput['path']);
      break;
    case 'bash':
      summary = str(toolInput['command']);
      break;
    case 'bash_output':
    case 'bash_kill':
      summary = str(toolInput['bash_id']);
      break;
    case 'web_fetch':
      summary = hostnameFromUrl(str(toolInput['url']));
      break;
    case 'show_pose':
      summary = str(toolInput['pose']);
      break;
    case 'get_current_pose':
      summary = '';
      break;
    default:
      summary = trunc(maskSensitive(JSON.stringify(toolInput)), 40);
      break;
  }
  return maskSensitive(summary);
}

/** stepPhrase 的文案函数最小形状，两端 i18n 的 t 都满足 */
export type NarrationTranslate = (
  key: string,
  opts?: Record<string, unknown>
) => string;

/** stepPhrase 的入参最小形状，两端 LiveStep 与 Thought 适配都结构兼容 */
export interface NarrationStep {
  tool: string;
  detail: string;
  toolTitle?: string;
}

/**
 * 单个步骤的自然语言动向句，三级取值链，模型自写短标题优先，
 * 查表翻译次之，未登记的第三方工具回退 正在执行 加短名，
 * 全名先剥条目前缀再查表，截断口径只剩 Bash 24。
 * 这是双端时间线动向句的唯一权威版本，desktop 直接 import，
 * mobile 在 react-native/src/lib/tool-summary.ts 维护整块镜像，两处改动需同步。
 * @param t 文案函数
 * @param step 待叙述的步骤
 */
export function stepPhrase<T extends NarrationStep>(
  t: NarrationTranslate,
  step: T
): string {
  if (step.toolTitle) return step.toolTitle;
  switch (shortToolName(step.tool)) {
    case '':
      return t('live.thinking');
    case 'read_file':
      return step.detail
        ? `${t('live.read')} ${baseName(step.detail)}`
        : t('live.readFallback');
    case 'write_file':
      return step.detail
        ? `${t('live.write')} ${baseName(step.detail)}`
        : t('live.writeFallback');
    case 'edit_file':
      return step.detail
        ? `${t('live.edit')} ${baseName(step.detail)}`
        : t('live.editFallback');
    case 'bash':
      return step.detail
        ? `${t('live.bash')} ${trunc(step.detail, 24)}`
        : t('live.bashFallback');
    case 'bash_output':
      return t('live.bashOutput');
    case 'bash_kill':
      return t('live.bashKill');
    case 'web_fetch':
      return step.detail
        ? `${t('live.webfetch')} ${step.detail}`
        : t('live.webfetchFallback');
    case 'show_pose':
      return t('live.showPose');
    case 'get_current_pose':
      return t('live.getPose');
    default:
      return `${t('live.executing')} ${shortToolName(step.tool)}`;
  }
}
