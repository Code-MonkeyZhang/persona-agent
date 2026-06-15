/**
 * @file src/renderer/lib/utils.ts
 * @description 通用工具函数，提供 className 合并与文件读取能力
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

/**
 * 将文件读取为 Data URL（base64）字符串
 * @param file - 待读取的文件
 * @returns base64 编码的 Data URL
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
