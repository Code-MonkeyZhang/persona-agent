/**
 * @file src/renderer/hooks/useImageFileInput.ts
 * @description 统一「选择图片 → 读取为 dataURL → 上抛 → 重置 input」流程
 */

import React, { useRef } from 'react';
import { readFileAsDataURL } from '../lib/utils';
import { logger } from '../lib/logger';

/**
 * 图片选择 hook：返回隐藏 input 所需的 ref 与 change 处理器。
 * 选定文件后读成 dataURL 调用 onPick，随后清空 input value，
 * 保证再次选择同一文件时 change 事件仍会触发。
 * @param onPick - 拿到原始文件与其 dataURL 的回调
 */
export function useImageFileInput(
  onPick: (file: File, dataUrl: string) => void
) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    logger.info(`[ImageInput] picked ${file.name} (${file.size} bytes)`);
    const dataUrl = await readFileAsDataURL(file);
    onPick(file, dataUrl);
    e.target.value = '';
  };

  return { inputRef, handleChange };
}
