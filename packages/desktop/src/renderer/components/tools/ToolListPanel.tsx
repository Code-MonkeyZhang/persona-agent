/**
 * @file src/renderer/components/tools/ToolListPanel.tsx
 * @description 工具页左栏，上为已分配工具，下为未分配工具
 * 内置工具常驻已分配组，挂载与解绑即点即生效，卡片在两个分区之间移动，归属即位置
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { McpServerInfo } from '../../lib/api';
import { useAgentStore } from '../../stores/agentStore';
import { logger } from '../../lib/logger';
import { AssignButton, UnassignButton } from '../common/AssignButtons';
import { SidePanelShell, EmptyHint } from '../common/SidePanel';
import { CollapsibleGroup } from '../common/CollapsibleGroup';
import { BUILT_IN_TOOLS, type ToolSelection } from './builtInTools';
import { BuiltinToolRow, McpRow, nodeProps } from './toolRows';

interface ToolListPanelProps {
  agentId: string;
  servers: McpServerInfo[];
  selection: ToolSelection | null;
  onSelect: (sel: ToolSelection) => void;
}

export function ToolListPanel({
  agentId,
  servers,
  selection,
  onSelect,
}: ToolListPanelProps) {
  const { t } = useTranslation();
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));
  const assignMcp = useAgentStore((s) => s.assignMcp);
  const unassignMcp = useAgentStore((s) => s.unassignMcp);

  const [groupsOpen, setGroupsOpen] = useState({ assigned: true, pool: true });

  if (!agent) return null;

  const assignedItems = servers.filter((s) => agent.mcpNames.includes(s.name));
  const poolItems = servers.filter((s) => !agent.mcpNames.includes(s.name));

  const assign = (name: string) => {
    logger.info('[Tools] 分配 MCP', { mcp: name, agent: agentId });
    void assignMcp(agentId, name);
  };
  const unassign = (name: string) => {
    logger.info('[Tools] 取消分配 MCP', { mcp: name, agent: agentId });
    void unassignMcp(agentId, name);
  };

  return (
    <SidePanelShell width="w-[260px]" contentClassName="pt-2">
      {/* 已分配工具分组，内置工具与挂载的 MCP 同住，计数合并 */}
      <CollapsibleGroup
        label={t('tools.assigned')}
        count={BUILT_IN_TOOLS.length + assignedItems.length}
        open={groupsOpen.assigned}
        onOpenChange={(o) => setGroupsOpen((g) => ({ ...g, assigned: o }))}
      >
        {BUILT_IN_TOOLS.map((tool) => (
          <BuiltinToolRow
            key={tool.id}
            tool={tool}
            {...nodeProps(selection, onSelect, {
              kind: 'builtin',
              id: tool.id,
            })}
          />
        ))}
        {assignedItems.map((server) => (
          <McpRow
            key={server.name}
            server={server}
            {...nodeProps(selection, onSelect, {
              kind: 'mcp',
              id: server.name,
            })}
            action={<UnassignButton onClick={() => unassign(server.name)} />}
          />
        ))}
      </CollapsibleGroup>

      {/* 未分配工具分组，未挂载的服务加号挂给当前 Agent */}
      <CollapsibleGroup
        label={t('tools.pool')}
        count={poolItems.length}
        open={groupsOpen.pool}
        onOpenChange={(o) => setGroupsOpen((g) => ({ ...g, pool: o }))}
      >
        {poolItems.length === 0 ? (
          <EmptyHint text={t('tools.emptyPool')} />
        ) : (
          poolItems.map((server) => (
            <McpRow
              key={server.name}
              server={server}
              {...nodeProps(selection, onSelect, {
                kind: 'mcp',
                id: server.name,
              })}
              action={<AssignButton onClick={() => assign(server.name)} />}
            />
          ))
        )}
      </CollapsibleGroup>
    </SidePanelShell>
  );
}
