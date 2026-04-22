/**
 * @file src/renderer/lib/utils.ts
 * @description 通用工具函数，主要提供 className 合并能力
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并多个 className 值，自动处理 Tailwind CSS 类名冲突
 * @param inputs - 待合并的 className 值列表
 * @returns 合并后的 className 字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
