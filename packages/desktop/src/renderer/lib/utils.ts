/**
 * @file src/renderer/lib/utils.ts
 * @description 通用工具函数，提供 className 合并与文件读取能力
 */

import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * 自定义合并器，把语义字号档位注册进 font-size 分组。
 * tailwind-merge 默认只认识 T 恤尺码命名的字号，陌生的 text- 前缀词会被误判为
 * 文字颜色并在合并时删除。这份名单必须与 tailwind.config.js 的 fontSize 定义
 * 保持同步，任何一边增删档位都要同步另一边。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'micro',
            'caption',
            'body',
            'body-strong',
            'content',
            'title-section',
            'title-page',
            'title-display',
          ],
        },
      ],
    },
  },
});

/**
 * 合并多个 className 值，自动处理 Tailwind CSS 类名冲突
 * @param inputs - 待合并的 className 值列表
 * @returns 合并后的 className 字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 将文件读取为 Data URL 字符串
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

const PREVIEW_TEXT_KEYS = [
  'voice.previewText1',
  'voice.previewText2',
  'voice.previewText3',
];

/**
 * 随机取一句试听文案，语言跟随界面语言
 * @param t - i18n 翻译函数
 * @returns 随机选中的试听句
 */
export function getRandomPreviewText(t: (key: string) => string): string {
  return t(
    PREVIEW_TEXT_KEYS[Math.floor(Math.random() * PREVIEW_TEXT_KEYS.length)]
  );
}
