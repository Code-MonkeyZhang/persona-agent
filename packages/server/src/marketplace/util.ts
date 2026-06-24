/**
 * @fileoverview Marketplace 工具函数：名字安全校验、清单条目解析。
 */

/**
 * 合法的 Skill 名字：英文小写 + 数字 + 短横线，须以小写字母或数字开头。
 * 用于校验来自 URL 的 :name 参数，杜绝路径穿越。
 */
export const SAFE_SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 名字是否合法 */
export function isSafeSkillName(name: string): boolean {
  return SAFE_SKILL_NAME.test(name);
}

/** 取清单条目的文件夹名 */
export function folderNameOf(entry: { path: string }): string {
  const parts = entry.path.split('/');
  return parts[parts.length - 1];
}
