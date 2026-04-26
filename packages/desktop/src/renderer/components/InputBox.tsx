/**
 * @file components/InputBox.tsx
 * @description 聊天输入框组件 - 负责用户消息的输入、编辑和发送
 *
 * 包含以下功能：
 * - 多行文本输入，自动根据内容调整高度（最大 200px）
 * - 按 Enter 发送消息，Shift+Enter 换行
 * - 底部工具栏：添加附件按钮、工作目录选择器、模型选择器、发送按钮
 * - 聚焦/失焦时切换输入框边框样式
 */

import React, { useState, useRef, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModelSelector } from './ModelSelector';
import { WorkspaceSelector } from './WorkspaceSelector';
import type { ProviderInfo } from '../lib/api';

/**
 * InputBox 组件的属性接口
 */
interface InputBoxProps {
  /** 发送消息的回调函数，参数为用户输入的文本内容 */
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** 当前可用的模型供应商列表，传递给 ModelSelector */
  providers: ProviderInfo[];
  currentModelId: string;
  currentProviderId: string | undefined;
  workspacePath: string | undefined;
  onModelChange: (modelId: string) => void;
  onProviderChange: (providerId: string) => void;
  onWorkspaceChange: (path: string | undefined) => void;
}

/**
 * 聊天输入框组件
 *
 * 提供消息输入、模型选择、工作目录选择和消息发送功能。
 * 文本框支持多行输入和自动高度调节，按 Enter 发送，Shift+Enter 换行。
 *
 * @param props - 组件属性，参见 {@link InputBoxProps}
 * @returns 渲染的输入框 JSX 元素
 */
export const InputBox: React.FC<InputBoxProps> = ({
  onSend,
  isLoading,
  disabled,
  providers,
  currentModelId,
  currentProviderId,
  workspacePath,
  onModelChange,
  onProviderChange,
  onWorkspaceChange,
}) => {
  /** 用户当前输入的文本内容 */
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  /** textarea 元素的引用，用于手动重置高度 */
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 发送消息处理函数
   *
   * 检查输入内容非空且组件未被禁用或加载中时，调用外部 onSend 回调，
   * 然后清空输入框并将 textarea 高度重置为初始值。
   */
  const handleSend = useCallback(() => {
    if (input.trim() && !disabled && !isLoading) {
      onSend(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [input, disabled, isLoading, onSend]);

  /**
   * 键盘事件处理函数
   *
   * 按下 Enter 键时发送消息（阻止默认换行行为），
   * 按下 Shift+Enter 时不拦截，允许正常换行。
   *
   * @param e - 键盘事件对象
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * 输入内容变化处理函数
   *
   * 同步输入值到 state，并根据内容实际高度动态调整 textarea 高度，
   * 最大高度限制为 200px，避免输入框无限撑开。
   *
   * @param e - 输入事件对象
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  return (
    <div className="px-4 pb-4">
      {/* 输入框容器：聚焦时显示描边和阴影，失焦时显示半透明背景 */}
      <div
        className={cn(
          'relative flex flex-col rounded-2xl transition-all duration-200',
          isFocused
            ? 'ring-1 ring-primary/30 bg-card shadow-sm'
            : 'bg-muted/50 hover:bg-muted/70'
        )}
      >
        {/* 文本输入区域 */}
        <div className="px-3 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="输入消息..."
            rows={1}
            className="w-full bg-transparent resize-none focus:outline-none text-sm text-foreground placeholder:text-muted-foreground/50 min-h-[24px]"
            style={{ maxHeight: '200px' }}
          />
        </div>

        {/* 底部工具栏：左侧为功能按钮，右侧为发送按钮 */}
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          {/* 左侧工具按钮组 */}
          <div className="flex items-center gap-1">
            {/* 添加附件按钮（当前为占位，暂无实际功能） */}
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors duration-150"
              title="添加附件"
            >
              <Plus size={18} />
            </button>
            {/* 工作目录选择器 */}
            <WorkspaceSelector
              value={workspacePath}
              onChange={onWorkspaceChange}
              disabled={false}
              compact
            />
            {/* 模型和供应商选择器 */}
            <ModelSelector
              providers={providers}
              value={currentModelId}
              onChange={onModelChange}
              providerValue={currentProviderId}
              onProviderChange={onProviderChange}
              showOnlyVerified={true}
              compact
            />
          </div>

          {/* 发送按钮：有内容且非加载中时高亮可点击，否则灰显禁用 */}
          <button
            onClick={handleSend}
            disabled={disabled || !input.trim() || isLoading}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200',
              input.trim() && !isLoading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                : 'bg-muted/50 text-muted-foreground/40 cursor-not-allowed'
            )}
            title="发送消息"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
