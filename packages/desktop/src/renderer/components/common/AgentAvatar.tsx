/**
 * @file src/renderer/components/common/AgentAvatar.tsx
 * @description Agent 头像组件，展示自定义头像图片，不可用时显示 UserRound 图标占位符
 */

import React, { useState, useEffect } from 'react';
import { UserRound } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAgentAvatarUrl } from '../../lib/api';
import { useAgentStore } from '../../stores/agentStore';
import type { AgentConfig } from '../../types/agent';

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  'md-plus': 'w-11 h-11',
  lg: 'w-16 h-16',
};

const iconSizeMap = {
  sm: 14,
  md: 18,
  'md-plus': 20,
  lg: 28,
};

interface AgentAvatarProps {
  agent: AgentConfig;
  size?: 'sm' | 'md' | 'md-plus' | 'lg';
  className?: string;
  editingPreviewUrl?: string;
}

/**
 * Agent 头像组件，支持自定义头像图片加载和 UserRound 图标占位符
 *
 * 渲染优先级：
 * - editingPreviewUrl — 编辑器中选了新图片时的即时预览
 * - store 中的 agentAvatarPreviews[agentId] — 新建 Agent 上传期间的本地预览
 * - 服务器头像 URL，avatarHash 为空表示无头像文件，直接走占位图标不发请求
 */
export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  agent,
  size = 'md',
  className,
  editingPreviewUrl,
}) => {
  const [hasError, setHasError] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const localPreview = useAgentStore((s) => s.agentAvatarPreviews[agent.id]);

  useEffect(() => {
    setHasError(false);
    if (editingPreviewUrl) {
      setAvatarUrl(editingPreviewUrl);
    } else if (localPreview) {
      setAvatarUrl(localPreview);
    } else if (agent.avatarHash) {
      setAvatarUrl(getAgentAvatarUrl(agent.id, agent.avatarHash));
    } else {
      setAvatarUrl(null);
    }
  }, [agent.id, agent.avatarHash, editingPreviewUrl, localPreview]);

  if (hasError || !avatarUrl) {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center bg-gray-100 text-gray-400',
          sizeMap[size],
          className
        )}
      >
        <UserRound size={iconSizeMap[size]} />
      </div>
    );
  }

  return (
    <img
      src={avatarUrl!}
      alt={agent.name}
      className={cn('rounded-full object-cover', sizeMap[size], className)}
      onError={() => setHasError(true)}
    />
  );
};
