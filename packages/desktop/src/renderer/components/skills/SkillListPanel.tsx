/**
 * @file src/renderer/components/skills/SkillListPanel.tsx
 * @description 技能页左栏，上为已分配技能，下为技能库
 * 行不放图标与状态点，名字行干净，副行是截断的描述，分配加减号与工具页同制
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillInfo } from '../../lib/api';
import { useAgentStore } from '../../stores/agentStore';
import { logger } from '../../lib/logger';
import { RowCard } from '../common/RowCard';
import { AssignButton, UnassignButton } from '../common/AssignButtons';
import { SidePanelShell, EmptyHint } from '../common/SidePanel';
import { CollapsibleGroup } from '../common/CollapsibleGroup';

interface SkillRowProps {
  skill: SkillInfo;
  selected: boolean;
  onClick: () => void;
  action?: ReactNode;
}

/** 技能行，第一行显示名，副行截断的描述，技能页与设置页共用 */
export function SkillRow({ skill, selected, onClick, action }: SkillRowProps) {
  return (
    <RowCard selected={selected} onClick={onClick}>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-content text-foreground">
          {skill.displayName ?? skill.name}
        </span>
        <span className="mt-0.5 block truncate text-micro text-muted-foreground">
          {skill.description}
        </span>
      </div>
      {action && (
        <div
          className="shrink-0 self-center"
          onClick={(e) => e.stopPropagation()}
        >
          {action}
        </div>
      )}
    </RowCard>
  );
}

interface SkillListPanelProps {
  agentId: string;
  entries: SkillInfo[];
  selection: string | null;
  onSelect: (name: string) => void;
}

export function SkillListPanel({
  agentId,
  entries,
  selection,
  onSelect,
}: SkillListPanelProps) {
  const { t } = useTranslation();
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));
  const assignSkill = useAgentStore((s) => s.assignSkill);
  const unassignSkill = useAgentStore((s) => s.unassignSkill);

  const [groupsOpen, setGroupsOpen] = useState({ assigned: true, pool: true });

  if (!agent) return null;

  const assignedSkills = entries.filter((s) =>
    agent.skillNames.includes(s.name)
  );
  const poolSkills = entries.filter((s) => !agent.skillNames.includes(s.name));

  const assign = (name: string) => {
    logger.info('[Skills] 分配技能', { name, agent: agentId });
    void assignSkill(agentId, name);
  };
  const unassign = (name: string) => {
    logger.info('[Skills] 取消分配技能', { name, agent: agentId });
    void unassignSkill(agentId, name);
  };

  return (
    <SidePanelShell width="w-[260px]" contentClassName="pt-2">
      <CollapsibleGroup
        label={t('skills.assigned')}
        count={assignedSkills.length}
        open={groupsOpen.assigned}
        onOpenChange={(o) => setGroupsOpen((g) => ({ ...g, assigned: o }))}
      >
        {assignedSkills.length === 0 ? (
          <EmptyHint text={t('skills.emptyAssigned')} />
        ) : (
          assignedSkills.map((skill) => (
            <SkillRow
              key={skill.name}
              skill={skill}
              selected={selection === skill.name}
              onClick={() => onSelect(skill.name)}
              action={<UnassignButton onClick={() => unassign(skill.name)} />}
            />
          ))
        )}
      </CollapsibleGroup>

      <CollapsibleGroup
        label={t('skills.library')}
        count={poolSkills.length}
        open={groupsOpen.pool}
        onOpenChange={(o) => setGroupsOpen((g) => ({ ...g, pool: o }))}
      >
        {poolSkills.length === 0 ? (
          <EmptyHint text={t('skills.emptyLibrary')} />
        ) : (
          poolSkills.map((skill) => (
            <SkillRow
              key={skill.name}
              skill={skill}
              selected={selection === skill.name}
              onClick={() => onSelect(skill.name)}
              action={<AssignButton onClick={() => assign(skill.name)} />}
            />
          ))
        )}
      </CollapsibleGroup>
    </SidePanelShell>
  );
}
