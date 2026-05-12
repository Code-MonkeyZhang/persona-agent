/**
 * @file src/renderer/components/AgentAvatar.tsx
 * @description Agent 头像组件，展示自定义头像图片，不可用时显示 VenetianMask 图标占位符
 */

import React, { useState, useEffect } from 'react';
import { VenetianMask } from 'lucide-react';
import { cn } from '../lib/utils';
import { getAgentAvatarUrl } from '../lib/api';
import { useAgentStore } from '../stores/agentStore';
import type { Agent } from '../types/agent';

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
};

const iconSizeMap = {
  sm: 14,
  md: 18,
  lg: 28,
};

interface AgentAvatarProps {
  agent: Agent;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** 编辑器中的 base64 预览 URL（如 "data:image/..."），传入时优先使用 */
  editingPreviewUrl?: string;
}

/**
 * Agent 头像组件，支持自定义头像图片加载和 VenetianMask 图标占位符
 *
 * 渲染优先级：
 * 1. editingPreviewUrl — 编辑器中选了新图片时的即时预览
 * 2. store 中的 agentAvatarPreviews[agentId] — 新建 Agent 上传期间的本地预览
 * 3. 服务器头像 URL（GET /api/agents/:id/avatar），加载失败时显示 VenetianMask 图标
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
    } else {
      setAvatarUrl(getAgentAvatarUrl(agent.id));
    }
  }, [agent.id, agent.updatedAt, editingPreviewUrl, localPreview]);

  if (hasError) {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center bg-gray-100 text-gray-400',
          sizeMap[size],
          className
        )}
      >
        <VenetianMask size={iconSizeMap[size]} />
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
