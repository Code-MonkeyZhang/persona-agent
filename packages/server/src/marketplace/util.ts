/**
 * @fileoverview Marketplace 工具函数：名字安全校验、清单条目解析。
 */

/**
 * 合法的 Skill 名字：英文小写 + 数字 + 短横线，须以小写字母或数字开头。
 * 用于校验来自 URL 的 :name 参数，杜绝路径穿越。
 */
const SAFE_SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 名字是否合法 */
export function isSafeSkillName(name: string): boolean {
  return SAFE_SKILL_NAME.test(name);
}

/**
 * 取清单条目的机器键。
 * 优先读显式 id，缺失或不合法时回退 path 末段派生，新旧清单数据都兼容。
 * id 来自远程清单且取值会进本地路径拼接，所以过 SAFE_SKILL_NAME 校验防路径穿越。
 */
export function folderNameOf(entry: { id?: string; path: string }): string {
  if (entry.id && SAFE_SKILL_NAME.test(entry.id)) return entry.id;
  const parts = entry.path.split('/');
  return parts[parts.length - 1];
}
