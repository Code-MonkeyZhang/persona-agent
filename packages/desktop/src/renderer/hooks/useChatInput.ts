/**
 * @file src/renderer/hooks/useChatInput.ts
 * @description 聊天输入框 hook，封装 textarea 自动撑高、IME 兼容的 Enter 发送、输入值管理和高度重置
 */

import { useState, useRef, useCallback } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';

interface UseChatInputOptions {
  /** textarea 最大高度（px） */
  maxHeight: number;
  /** Enter 发送回调（组件负责校验和实际发送逻辑） */
  onSend: () => void;
}

/**
 * 聊天输入框 hook，统一封装 InputBox 和 CompanionPanel 中重复的 textarea 逻辑：
 * - 输入值管理（state + setter）
 * - 根据内容自动撑高，上限 maxHeight
 * - IME 兼容的 Enter 发送（Shift+Enter 换行，输入法组合状态不触发）
 * - reset 清空输入框并重置高度
 *
 * @returns input - 当前输入值；setInput - 直接设置输入值；
 *          textareaRef - 绑定到 textarea 的 ref；
 *          handleChange - 绑定到 onChange；handleKeyDown - 绑定到 onKeyDown；
 *          reset - 清空并重置
 */
export function useChatInput({ maxHeight, onSend }: UseChatInputOptions) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** 用 ref 持有最新的 onSend，避免 handleKeyDown 依赖变化导致重建 */
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  /** 清空输入框并重置 textarea 高度为初始值 */
  const reset = useCallback(() => {
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  /**
   * 输入内容变化处理：同步 state 并根据内容实际高度撑高 textarea，
   * 上限 maxHeight，避免输入框无限撑开。
   */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
    },
    [maxHeight]
  );

  /**
   * 键盘事件处理：输入法组合状态不拦截，
   * Enter 发送（Shift+Enter 换行）
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendRef.current();
    }
  };

  return { input, setInput, textareaRef, handleChange, handleKeyDown, reset };
}
