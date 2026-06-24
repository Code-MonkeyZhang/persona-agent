/**
 * @file components/InputBox.tsx
 * @description 聊天输入框组件 - 负责用户消息的输入、编辑和发送
 *
 * 包含以下功能：
 * - 多行文本输入，自动根据内容调整高度
 * - 按 Enter 发送消息，Shift+Enter 换行
 * - 底部工具栏：添加附件按钮、工作目录选择器、模型选择器、发送按钮
 * - 聚焦/失焦时切换输入框边框样式
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { useChatInput } from '../hooks/useChatInput';
import { ModelSelector } from './ModelSelector';
import { WorkspaceSelector } from './WorkspaceSelector';
import type { ProviderStatus } from '../lib/api';

/**
 * InputBox 组件的属性接口
 */
interface InputBoxProps {
  /** 发送消息的回调函数，参数为用户输入的文本内容 */
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** 当前可用的模型供应商列表，传递给 ModelSelector */
  providers: ProviderStatus[];
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
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = React.useState(false);

  const { input, textareaRef, handleChange, handleKeyDown, reset } =
    useChatInput({
      maxHeight: 200,
      onSend: () => {
        const text = input.trim();
        if (text && !disabled && !isLoading) {
          onSend(text);
          reset();
        }
      },
    });

  return (
    <div className="px-4 pb-4">
      {/* 输入框容器：聚焦时显示描边和阴影，失焦时显示半透明背景 */}
      <div
        className={cn(
          'relative flex flex-col rounded-2xl transition-all duration-200',
          isFocused
            ? 'ring-1 ring-[#222]/20 bg-white'
            : 'bg-[#f5f5f5] hover:bg-[#f0f0f0]'
        )}
      >
        {/* 文本输入区域 */}
        <div className="px-3 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t('inputBox.placeholder')}
            rows={1}
            className="w-full bg-transparent resize-none focus:outline-none text-[15px] text-[#333] placeholder:text-[#b0b0b0] min-h-[24px]"
            style={{ maxHeight: '200px' }}
          />
        </div>

        {/* 底部工具栏：左侧为功能按钮，右侧为发送按钮 */}
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          {/* 左侧工具按钮组 */}
          <div className="flex items-center gap-1">
            {/* 添加附件按钮 */}
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors duration-150"
              title={t('inputBox.addAttachment')}
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
            onClick={() => {
              const text = input.trim();
              if (text && !disabled && !isLoading) {
                onSend(text);
                reset();
              }
            }}
            disabled={disabled || !input.trim() || isLoading}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200',
              input.trim() && !isLoading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                : 'bg-muted/50 text-muted-foreground/40 cursor-not-allowed'
            )}
            title={t('inputBox.sendMessage')}
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
