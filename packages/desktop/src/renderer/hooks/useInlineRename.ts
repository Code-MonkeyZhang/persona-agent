/**
 * @file src/renderer/hooks/useInlineRename.ts
 * @description 行内重命名的通用状态逻辑
 */

import { useEffect, useRef, useState } from 'react';
import { logger } from '../lib/logger';

/**
 * 行内重命名 hook：管理「哪个条目在编辑 + 输入草稿」。
 * - 进入编辑时自动聚焦输入框并全选原有文字
 * - confirm 在输入去空格后非空、且与原标题不同时才回调，随后退出编辑
 * - cancel 直接退出编辑并清空草稿
 * 失焦是否视为确认由调用方决定，hook 不绑定。
 * @param onConfirm - 确认回调，拿到编辑中的 key 与新标题
 */
export function useInlineRename<K extends string | number>(
  onConfirm: (key: K, title: string) => void
) {
  const [editingKey, setEditingKey] = useState<K | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const initialRef = useRef('');

  useEffect(() => {
    if (editingKey !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingKey]);

  /** 进入编辑：记录原标题并预填草稿 */
  const start = (key: K, initial: string) => {
    initialRef.current = initial;
    setEditingKey(key);
    setDraft(initial);
  };

  /** 确认改名：有效且变化时回调，随后退出编辑 */
  const confirm = () => {
    if (editingKey === null) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== initialRef.current) {
      logger.info(`[InlineRename] confirmed key=${String(editingKey)}`);
      onConfirm(editingKey, trimmed);
    }
    setEditingKey(null);
    setDraft('');
  };

  /** 取消改名：丢弃草稿退出编辑 */
  const cancel = () => {
    setEditingKey(null);
    setDraft('');
  };

  return { editingKey, draft, setDraft, inputRef, start, confirm, cancel };
}
