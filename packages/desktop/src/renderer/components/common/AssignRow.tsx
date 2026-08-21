/**
 * @file src/renderer/components/common/AssignRow.tsx
 * @description Agent 工具页 / 技能页分配列表用的横向单行。MCP 与 Skill 共用，靠 type 区分：
 * - MCP：名字 + 状态点与状态文案
 * - Skill：名字 + 简介副标题
 * 两类都不显示 logo（名字顶格）。右侧动作由 variant 决定：
 * - assigned：✕ 移除（悬停才出现）
 * - available：＋ 分配（悬停转蓝底）
 * 点 ✕/＋ 只改调用方持有的草稿，不立即落库，由各分配页统一保存。
 */

import React from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { McpServerInfo } from '@persona/shared';
import { ItemInfo } from './ItemInfo';

type AssignRowProps = {
  variant: 'assigned' | 'available';
  onAction: () => void;
} & (
  | { type: 'mcp'; name: string; mcp?: McpServerInfo }
  | { type: 'skill'; name: string; description?: string }
);

/**
 * 分配行。MCP 副标题沿用管理行的状态点与状态文案（共用 store helper）。
 */
export const AssignRow: React.FC<AssignRowProps> = (props) => {
  const { t } = useTranslation();
  const isMcp = props.type === 'mcp';

  return (
    <div className="group relative flex items-center gap-2.5 px-3 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-all text-left">
      {isMcp ? (
        <ItemInfo name={props.name} type="mcp" mcp={props.mcp} />
      ) : (
        <ItemInfo
          name={props.name}
          type="skill"
          description={props.description}
        />
      )}

      {props.variant === 'assigned' ? (
        <button
          onClick={props.onAction}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground/60 hover:bg-black/5 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
          title={t('marketplace.remove')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          onClick={props.onAction}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          title={t('marketplace.assign')}
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
