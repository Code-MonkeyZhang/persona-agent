/**
 * @file components/AgentToolsView.tsx
 * @description Agent 工具视图，独立于 AgentEditor，采用草稿+保存模式。
 * 从 currentAgent.mcpNames 初始化草稿，保存后调 updateAgentMcpNames 写入后端。
 * 两段式布局：上半「已分配」+ 下半「可用 MCP」，行渲染统一用 AssignRow。
 *
 * 商城入口已收口到左下角罗盘，本页不再提供"浏览商城"按钮；要装新的 MCP 去罗盘。
 */
import React, { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listMcpServers, type McpServerInfo } from '../lib/api';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import { logger } from '../lib/logger';
import { ScrollArea } from './ui/ScrollArea';
import { BackButton } from './ui/BackButton';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { AssignRow } from './cards/AssignRow';

export const AgentToolsView: React.FC = () => {
  const { t } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);
  const updateAgentMcpNames = useAgentStore((s) => s.updateAgentMcpNames);
  const setActiveNav = useViewStore((s) => s.setActiveNav);

  const [mcps, setMcps] = useState<McpServerInfo[]>([]);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>(
    currentAgent?.mcpNames ?? []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(true);
  const [availableOpen, setAvailableOpen] = useState(true);

  useEffect(() => {
    listMcpServers()
      .then(setMcps)
      .catch((err) => logger.error('Failed to load MCP servers:', err));
  }, []);

  /** Agent 切换时重新初始化草稿 */
  useEffect(() => {
    setSelectedMcpIds(currentAgent?.mcpNames ?? []);
  }, [currentAgent?.id]);

  /** 可用 MCP = 全部 MCP 中未被当前 Agent 选中的 */
  const availableMcps = mcps.filter((m) => !selectedMcpIds.includes(m.name));

  /** 保存当前 MCP 分配到后端，成功后返回聊天视图 */
  const handleSave = async () => {
    if (!currentAgent) return;
    setIsSaving(true);
    try {
      await updateAgentMcpNames(currentAgent.id, selectedMcpIds);
      logger.info(
        `[Tools] Saved MCP assignment for ${currentAgent.id}: ${selectedMcpIds.join(', ')}`
      );
      setActiveNav('chat');
    } catch (err) {
      logger.error('Failed to save MCP names:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /** 根据 name 查找 MCP 信息（已分配项可能按名引用，未必加载到详情） */
  const resolveMcp = (name: string): McpServerInfo | undefined =>
    mcps.find((m) => m.name === name);

  return (
    <div className="h-full w-full flex flex-col bg-general-bg">
      <div className="shrink-0 flex items-center gap-2 px-5 h-14 border-b border-border bg-muted">
        <BackButton onClick={() => setActiveNav('chat')} />
        <Wrench className="w-4 h-4 text-muted-foreground" />
        <h1 className="text-[16px] font-bold text-foreground">
          {t('tools.title')}
        </h1>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-foreground text-background hover:bg-foreground/90 rounded-lg h-8 px-5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="max-w-2xl mx-auto px-6 py-6">
            {/* 已分配 MCP */}
            <CollapsibleSection
              title={t('tools.assignedTo', { name: currentAgent?.name ?? '' })}
              count={selectedMcpIds.length}
              open={assignedOpen}
              onToggle={() => setAssignedOpen(!assignedOpen)}
            >
              {selectedMcpIds.length === 0 ? (
                <div className="px-1 py-3 text-[12px] text-muted-foreground/60">
                  {t('tools.emptyAssigned')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1 pb-2">
                  {selectedMcpIds.map((mcpId) => (
                    <AssignRow
                      key={mcpId}
                      type="mcp"
                      variant="assigned"
                      name={mcpId}
                      mcp={resolveMcp(mcpId)}
                      onAction={() =>
                        setSelectedMcpIds(
                          selectedMcpIds.filter((id) => id !== mcpId)
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* 可用 MCP */}
            <CollapsibleSection
              title={t('tools.available')}
              count={availableMcps.length}
              open={availableOpen}
              onToggle={() => setAvailableOpen(!availableOpen)}
            >
              {availableMcps.length === 0 ? (
                <div className="px-1 py-3 text-[12px] text-muted-foreground/60">
                  {t('tools.emptyAvailable')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1 pb-2">
                  {availableMcps.map((mcp) => (
                    <AssignRow
                      key={mcp.name}
                      type="mcp"
                      variant="available"
                      name={mcp.name}
                      mcp={mcp}
                      onAction={() =>
                        setSelectedMcpIds([...selectedMcpIds, mcp.name])
                      }
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
