/**
 * @file components/AppsView.tsx
 * @description 人格级 Agent App 分配视图。结构仿 AgentToolsView：草稿 + 保存模式。
 * 从 currentAgent.mcpNames 初始化草稿（应用与普通工具共用 mcpNames，此处只操作 agentApp 条目），
 * 保存后调 updateAgentMcpNames 写入后端——名字在 mcpNames 里，这个人格就能用该应用的工具。
 * 两段式布局：上半「已添加」+ 下半「可用应用」，行渲染统一用 AssignRow。
 *
 * 商城入口已收口到左下角罗盘，本页不放安装按钮；可用区为空时提示去商城。
 */
import React, { useState, useEffect } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listMcpServers, type McpServerInfo } from '../lib/api';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import { logger } from '../lib/logger';
import { ScrollArea } from './ui/ScrollArea';
import { BackButton } from './ui/BackButton';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { AssignRow } from './cards/AssignRow';

export const AppsView: React.FC = () => {
  const { t } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);
  const updateAgentMcpNames = useAgentStore((s) => s.updateAgentMcpNames);
  const setActiveNav = useViewStore((s) => s.setActiveNav);

  const [installedApps, setInstalledApps] = useState<McpServerInfo[]>([]);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>(
    currentAgent?.mcpNames ?? []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(true);
  const [availableOpen, setAvailableOpen] = useState(true);

  useEffect(() => {
    listMcpServers()
      .then((servers) => setInstalledApps(servers.filter((s) => s.agentApp)))
      .catch((err) => logger.error('Failed to load agent apps:', err));
  }, []);

  /** Agent 切换时重新初始化草稿 */
  useEffect(() => {
    setSelectedAppIds(currentAgent?.mcpNames ?? []);
  }, [currentAgent?.id]);

  /** 已添加 = 已装应用中名字在草稿里的；可用 = 已装但未添加的 */
  const assignedApps = installedApps.filter((a) =>
    selectedAppIds.includes(a.name)
  );
  const availableApps = installedApps.filter(
    (a) => !selectedAppIds.includes(a.name)
  );

  /** 保存当前应用分配到后端，成功后返回聊天视图 */
  const handleSave = async () => {
    if (!currentAgent) return;
    setIsSaving(true);
    try {
      await updateAgentMcpNames(currentAgent.id, selectedAppIds);
      logger.info(
        `[Apps] Saved app assignment for ${currentAgent.id}: ${assignedApps.map((a) => a.name).join(', ')}`
      );
      setActiveNav('chat');
    } catch (err) {
      logger.error('Failed to save MCP names (apps):', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-general-bg">
      <div className="shrink-0 flex items-center gap-2 px-5 h-14 border-b border-border bg-muted">
        <BackButton onClick={() => setActiveNav('chat')} />
        <LayoutGrid className="w-4 h-4 text-muted-foreground" />
        <h1 className="text-[16px] font-bold text-foreground">
          {t('apps.title')}
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
            {/* 已添加应用 */}
            <CollapsibleSection
              title={t('apps.assignedTo', { name: currentAgent?.name ?? '' })}
              count={assignedApps.length}
              open={assignedOpen}
              onToggle={() => setAssignedOpen(!assignedOpen)}
            >
              {assignedApps.length === 0 ? (
                <div className="px-1 py-3 text-[12px] text-muted-foreground/60">
                  {t('apps.emptyAssigned')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1 pb-2">
                  {assignedApps.map((app) => (
                    <AssignRow
                      key={app.name}
                      type="mcp"
                      variant="assigned"
                      name={app.name}
                      mcp={app}
                      onAction={() =>
                        setSelectedAppIds(
                          selectedAppIds.filter((id) => id !== app.name)
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* 可用应用 */}
            <CollapsibleSection
              title={t('apps.available')}
              count={availableApps.length}
              open={availableOpen}
              onToggle={() => setAvailableOpen(!availableOpen)}
            >
              {availableApps.length === 0 ? (
                <div className="px-1 py-3 text-[12px] text-muted-foreground/60">
                  {t('apps.emptyAvailable')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1 pb-2">
                  {availableApps.map((app) => (
                    <AssignRow
                      key={app.name}
                      type="mcp"
                      variant="available"
                      name={app.name}
                      mcp={app}
                      onAction={() =>
                        setSelectedAppIds([...selectedAppIds, app.name])
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
