/**
 * @file src/renderer/components/common/ItemInfo.tsx
 * @description 管理行与分配行共用的左侧信息列
 */

import React from 'react';
import type { McpServerInfo } from '@persona/shared';
import { StatusDot } from '../ui/StatusDot';
import { mcpStatusColor, mcpStatusText } from '../../stores/marketplaceStore';

type ItemInfoProps = { name: string } & (
  | { type: 'mcp'; mcp?: McpServerInfo }
  | { type: 'skill'; description?: string }
);

/**
 * 列表行左侧信息列：名字 + 副标题。
 * - MCP 副标题：状态点 + 状态文案，有 error 时优先显示 error
 * - Skill 副标题：简介
 * @param name - 条目名字
 * @param mcp - MCP 详情，未加载到时仅显示名字
 * @param description - Skill 简介
 */
export const ItemInfo: React.FC<ItemInfoProps> = (props) => (
  <div className="min-w-0 flex-1">
    <div className="text-[13px] font-medium text-foreground truncate">
      {props.name}
    </div>
    {props.type === 'mcp' ? (
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
        <StatusDot
          color={mcpStatusColor(props.mcp?.status, !!props.mcp?.error)}
        />
        <span className="truncate">
          {props.mcp?.error || mcpStatusText(props.mcp)}
        </span>
      </div>
    ) : (
      <div className="text-[11px] text-muted-foreground truncate">
        {props.description}
      </div>
    )}
  </div>
);
