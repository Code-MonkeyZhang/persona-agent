/**
 * @file 工具调用参数的摘要与凭据掩码纯函数，desktop 与 server 共用
 * 掩码先于截断执行，Bash 命令可能携带凭据，顺序不能反
 */

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
  switch (toolName) {
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
