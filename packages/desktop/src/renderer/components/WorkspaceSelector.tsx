/**
 * @file src/renderer/components/WorkspaceSelector.tsx
 * @description 工作空间目录选择器，支持通过系统对话框选取或清除路径
 */

import React from 'react';
import { FolderOpen, X } from 'lucide-react';
import { logger } from '../lib/logger';

interface WorkspaceSelectorProps {
  value?: string;
  onChange: (path: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * 从完整路径中提取最后一级目录名
 * @param path 文件系统路径
 * @returns 目录名，路径为空时返回空字符串
 */
function getFolderName(path: string | undefined): string {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/**
 * 工作空间选择器组件，支持通过系统文件夹对话框选取或清除工作目录
 */
export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  value,
  onChange,
  placeholder = '选择工作空间',
  disabled = false,
  compact = false,
}) => {
  /**
   * 打开系统文件夹选择对话框，用户确认后将路径回传给父组件
   */
  const handleSelectFolder = async () => {
    if (disabled) return;

    try {
      const result = await window.api?.selectFolder?.({
        title: '选择工作空间',
        defaultPath: value,
      });

      if (result) {
        onChange(result);
      }
    } catch (error) {
      logger.error('Failed to select folder:', error);
    }
  };

  /**
   * 清除已选工作空间路径
   * @param e 鼠标点击事件
   */
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  if (compact) {
    return (
      <button
        onClick={handleSelectFolder}
        disabled={disabled}
        className="h-8 px-2 flex items-center gap-1 rounded-lg text-xs text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/50 transition-colors duration-150 max-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
        title={value || placeholder}
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="truncate">
          {value ? getFolderName(value) : placeholder}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        onClick={handleSelectFolder}
        className={`flex-1 flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {value ? (
          <span className="text-sm text-gray-900 truncate" title={value}>
            {getFolderName(value)}
          </span>
        ) : (
          <span className="text-sm text-gray-400">{placeholder}</span>
        )}
      </div>
      {value && !disabled && (
        <button
          onClick={handleClear}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
          title="清除工作空间"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
