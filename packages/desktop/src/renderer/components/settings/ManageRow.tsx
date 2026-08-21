/**
 * @file src/renderer/components/common/ManageRow.tsx
 * @description 设置页管理列表用的横向单行。MCP 与 Skill 共用，靠 type 区分：
 * - MCP：名字 + 状态点与状态文案 + OAuth（需要授权时）+ 卸载
 * - Skill：名字 + 简介副标题 + 卸载
 * 两类都不显示 logo（名字顶格）。卸载走行内二次确认，不弹窗：
 * 点卸载 → 整行变红底 → 原位换成 [取消][确认卸载]；确认态下 OAuth 暂时隐藏。
 */

import React, { useState } from 'react';
import { Trash2, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { McpServerInfo, SkillInfo } from '@persona/shared';
import { StatusDot } from '../ui/StatusDot';
import { mcpStatusColor, mcpStatusText } from '../../stores/marketplaceStore';
import { cn } from '../../lib/utils';

type ManageRowProps = { onUninstall: () => Promise<void> } & (
  | {
      type: 'mcp';
      mcp: McpServerInfo;
      authorizing: boolean;
      onAuthorize: () => void;
    }
  | { type: 'skill'; skill: SkillInfo }
);

/**
 * 管理行。卸载采用行内二次确认。
 */
export const ManageRow: React.FC<ManageRowProps> = (props) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const isMcp = props.type === 'mcp';
  const name = isMcp ? props.mcp.name : props.skill.name;

  const handleConfirm = async () => {
    setUninstalling(true);
    try {
      await props.onUninstall();
      setConfirming(false);
    } catch {
      // store 已弹 toast，这里只复位按钮态、保留确认态方便重试
      setUninstalling(false);
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-3 rounded-xl border text-left transition-colors',
        confirming
          ? 'border-red-300 bg-red-50'
          : 'border-card-border bg-card-bg'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground truncate">
          {name}
        </div>
        {isMcp ? (
          // MCP 副标题：状态点 + 状态文案（有 error 时优先显示 error）
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
            <StatusDot
              color={mcpStatusColor(props.mcp.status, !!props.mcp.error)}
            />
            <span className="truncate">
              {props.mcp.error || mcpStatusText(props.mcp)}
            </span>
          </div>
        ) : (
          // Skill 副标题：简介
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {props.skill.description}
          </div>
        )}
      </div>

      {/* 右侧操作：确认态只留取消/确认，其余隐藏 */}
      {confirming ? (
        <div className="shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => setConfirming(false)}
            disabled={uninstalling}
            className="h-7 px-2.5 text-[11px] rounded-full border border-input text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={uninstalling}
            className="h-7 px-2.5 text-[11px] rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1 transition-colors"
          >
            {uninstalling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            {t('marketplace.confirmUninstall')}
          </button>
        </div>
      ) : (
        <>
          {isMcp && props.mcp.status === 'needs_auth' && (
            <button
              onClick={props.onAuthorize}
              disabled={props.authorizing}
              className="shrink-0 h-7 px-2.5 text-[11px] rounded-full border border-input text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              {props.authorizing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ExternalLink className="w-3 h-3" />
              )}
              OAuth
            </button>
          )}
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 h-7 px-2.5 text-[11px] rounded-full border border-input text-muted-foreground hover:text-red-500 hover:border-red-300 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {t('marketplace.uninstall')}
          </button>
        </>
      )}
    </div>
  );
};
