/**
 * @file src/renderer/components/AgentAvatar.tsx
 * @description Agent 头像组件，优先展示自定义头像图片，不可用时显示基于名称的彩色首字母
 */

import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { getAgentAvatarUrl } from '../lib/api';
import type { Agent } from '../types/agent';

/**
 * 根据名称哈希值选取一组预设的背景/文字颜色
 * @param name Agent 名称
 * @returns Tailwind 颜色类名字符串
 */
const getAvatarColor = (name: string) => {
  const colors = [
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-blue-100 text-blue-700',
    'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700',
    'bg-cyan-100 text-cyan-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-2xl',
};

interface AgentAvatarProps {
  agent: Agent;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Agent 头像组件，支持自定义头像图片加载和首字母回退显示
 */
export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  agent,
  size = 'md',
  className,
}) => {
  const [hasError, setHasError] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    setHasError(false);
    if (agent.avatar) {
      if (agent.avatar.startsWith('data:image')) {
        setAvatarUrl(agent.avatar);
      } else {
        setAvatarUrl(getAgentAvatarUrl(agent.id));
      }
    } else {
      setAvatarUrl(null);
    }
  }, [agent.id, agent.avatar, agent.updatedAt]);

  if (!agent.avatar || hasError) {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-medium',
          sizeMap[size],
          getAvatarColor(agent.name),
          className
        )}
      >
        {agent.name.charAt(0).toUpperCase()}
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
