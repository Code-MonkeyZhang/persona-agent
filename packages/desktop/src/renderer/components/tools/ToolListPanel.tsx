/**
 * @file src/renderer/components/tools/ToolListPanel.tsx
 * @description 工具页左栏，上为内置工具组，中为已分配工具，下为未分配工具
 * 内置组常驻不参与分配，每行一枚开关，关闭置灰留在组内；
 * 外部工具加减号即时生效，分配写注册表条目 id，三类来源同一套写法
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolEntryInfo } from '../../lib/api';
import { useMcpStore } from '../../stores/mcpStore';
import { logger } from '../../lib/logger';
import { AssignButton, UnassignButton } from '../common/AssignButtons';
import { SidePanelShell, EmptyHint } from '../common/SidePanel';
import { CollapsibleGroup } from '../common/CollapsibleGroup';
import { Switch } from '../ui/Switch';
import { BuiltinToolRow, ExternalToolRow, nodeProps } from './toolRows';
import type { ToolSelection } from './toolRows';

interface ToolListPanelProps {
  agentId: string;
  entries: ToolEntryInfo[];
  selection: ToolSelection | null;
  onSelect: (sel: ToolSelection) => void;
}

export function ToolListPanel({
  agentId,
  entries,
  selection,
  onSelect,
}: ToolListPanelProps) {
  const { t } = useTranslation();
  const setAssignment = useMcpStore((s) => s.setAssignment);
  const assigning = useMcpStore((s) => s.assigning);

  const [groupsOpen, setGroupsOpen] = useState({
    builtin: true,
    assigned: true,
    pool: true,
  });

  const builtinItems = entries.filter((e) => e.kind === 'builtin');
  const externalItems = entries.filter((e) => e.kind !== 'builtin');
  const assignedItems = externalItems.filter((e) => e.assigned === true);
  const poolItems = externalItems.filter((e) => e.assigned !== true);

  const write = (entry: ToolEntryInfo, assigned: boolean) => {
    logger.info('[Tools] 分配写入', {
      entry: entry.id,
      agent: agentId,
      assigned,
    });
    void setAssignment(agentId, entry.id, assigned);
  };

  return (
    <SidePanelShell width="w-[260px]" contentClassName="pt-2">
      {/* 内置工具组，常驻置顶，每行一枚开关 */}
      <CollapsibleGroup
        label={t('tools.builtinGroup')}
        count={builtinItems.length}
        open={groupsOpen.builtin}
        onOpenChange={(o) => setGroupsOpen((g) => ({ ...g, builtin: o }))}
      >
        {builtinItems.map((entry) => (
          <BuiltinToolRow
            key={entry.id}
            entry={entry}
            {...nodeProps(selection, onSelect, { id: entry.id })}
            switchSlot={
              <Switch
                checked={entry.assigned !== false}
                onCheckedChange={(on) => write(entry, on)}
                disabled={assigning.has(entry.id)}
                aria-label={entry.name}
              />
            }
          />
        ))}
      </CollapsibleGroup>

      {/* 已分配工具分组，挂载的外部工具减号解绑 */}
      <CollapsibleGroup
        label={t('tools.assigned')}
        count={assignedItems.length}
        open={groupsOpen.assigned}
        onOpenChange={(o) => setGroupsOpen((g) => ({ ...g, assigned: o }))}
      >
        {assignedItems.length === 0 ? (
          <EmptyHint text={t('tools.emptyAssigned')} className="pl-8" />
        ) : (
          assignedItems.map((entry) => (
            <ExternalToolRow
              key={entry.id}
              name={entry.name}
              status={entry.status}
              logoUrl={entry.logoUrl}
              app={entry.kind === 'app'}
              {...nodeProps(selection, onSelect, { id: entry.id })}
              action={<UnassignButton onClick={() => write(entry, false)} />}
            />
          ))
        )}
      </CollapsibleGroup>

      {/* 未分配工具分组，未挂载的服务加号挂给当前 Agent */}
      <CollapsibleGroup
        label={t('tools.pool')}
        count={poolItems.length}
        open={groupsOpen.pool}
        onOpenChange={(o) => setGroupsOpen((g) => ({ ...g, pool: o }))}
      >
        {poolItems.length === 0 ? (
          <EmptyHint text={t('tools.emptyPool')} className="pl-8" />
        ) : (
          poolItems.map((entry) => (
            <ExternalToolRow
              key={entry.id}
              name={entry.name}
              status={entry.status}
              logoUrl={entry.logoUrl}
              app={entry.kind === 'app'}
              {...nodeProps(selection, onSelect, { id: entry.id })}
              action={<AssignButton onClick={() => write(entry, true)} />}
            />
          ))
        )}
      </CollapsibleGroup>
    </SidePanelShell>
  );
}
