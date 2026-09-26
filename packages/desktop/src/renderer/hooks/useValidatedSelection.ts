/**
 * @file src/renderer/hooks/useValidatedSelection.ts
 * @description 选中项失效自动修正的通用 hook
 * 列表详情类页面共用，卸载选中项、切换数据源、首次进入都由同一处修正覆盖
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { logger } from '../lib/logger';

/**
 * 持有选中值并在失效时自动回退。
 * @param isValid - 判定当前值是否仍有效
 * @param fallback - 失效时给出回退值
 * @returns 与 useState 同形的选中值与 setter
 */
export function useValidatedSelection<T>(
  isValid: (value: T) => boolean,
  fallback: () => T | null
): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [selection, setSelection] = useState<T | null>(null);

  useEffect(() => {
    setSelection((prev) => {
      if (prev && isValid(prev)) return prev;
      logger.info(
        '[useValidatedSelection] selection invalidated, falling back'
      );
      return fallback();
    });
  });

  return [selection, setSelection];
}
