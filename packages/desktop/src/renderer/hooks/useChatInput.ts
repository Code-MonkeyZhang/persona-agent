/**
 * @file src/renderer/hooks/useChatInput.ts
 * @description 聊天输入框 hook，封装 textarea 自动撑高、IME 兼容的 Enter 发送、输入值管理和高度重置
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';

interface UseChatInputOptions {
  maxHeight: number;
  /** 发送回调，返回 false 表示发送被否决（如上传失败），正文保留不清空 */
  onSend: (content: string) => boolean | void | Promise<boolean | void>;
  /** 内容为空时是否仍允许发送（如仅附件消息），每次发送前求值 */
  allowEmptySend?: () => boolean;
}

/**
 * 聊天输入框 hook，封装 textarea 自动撑高、IME 兼容的 Enter 发送、输入值管理和高度重置：
 * - 输入值管理
 * - 根据内容自动撑高，上限 maxHeight，程序化改动同步高度
 * - IME 兼容的 Enter 发送，发送被否决时正文与光标保持原样
 *
 * @returns input - 当前输入值；setInput - 直接设置输入值；
 *          textareaRef - 绑定到 textarea 的 ref；
 *          handleChange - 绑定到 onChange；handleKeyDown - 绑定到 onKeyDown；
 *          send - 触发一次发送，成功后清空输入框
 */
export function useChatInput({
  maxHeight,
  onSend,
  allowEmptySend,
}: UseChatInputOptions) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** 用 ref 持有最新的回调，避免 handleKeyDown 依赖变化导致重建 */
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const allowEmptyRef = useRef(allowEmptySend);
  allowEmptyRef.current = allowEmptySend;

  /** 输入内容变化处理：同步 state 并按内容实际高度撑高 textarea，上限 maxHeight */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
    },
    [maxHeight]
  );

  /** 输入值被程序化改动时同步高度 */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
  }, [input, maxHeight]);

  /** 发送：空正文仅在 allowEmptySend 放行时发出，被否决时正文保留 */
  const send = useCallback(async () => {
    const content = input.trim();
    if (!content && !allowEmptyRef.current?.()) return;
    const ok = await onSendRef.current(content);
    if (ok === false) return;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input]);

  /**
   * 键盘事件处理：输入法组合状态不拦截，
   * Enter 发送
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return { input, setInput, textareaRef, handleChange, handleKeyDown, send };
}
