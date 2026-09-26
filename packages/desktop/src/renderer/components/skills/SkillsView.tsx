/**
 * @file src/renderer/components/skills/SkillsView.tsx
 * @description Agent 技能视图，左右双栏
 * 左栏上下两组为已分配技能与技能库，加减号即时分配，右栏为选中技能的详情
 *
 * 商城入口已收口到左下角罗盘，本页不提供技能商城按钮
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listSkills, type SkillInfo } from '../../lib/api';
import { useAgentStore } from '../../stores/agentStore';
import { logger } from '../../lib/logger';
import { ListState } from '../common/ListState';
import { EmptyPane } from '../common/SidePanel';
import { useValidatedSelection } from '../../hooks/useValidatedSelection';
import { SkillListPanel } from './SkillListPanel';
import { SkillDetailPanel } from './SkillDetailPanel';

export const SkillsView: React.FC = () => {
  const { t } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);

  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setSkills(null);
    setError(null);
    listSkills()
      .then(setSkills)
      .catch((err) => {
        logger.error('Failed to load skills:', err);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * 选中技能失效时自动修正，回退到列表第一个技能。
   * 卸载技能、切换 Agent、首次进入由这一处逻辑覆盖。
   */
  const entries = skills ?? [];
  const [selection, setSelection] = useValidatedSelection<string>(
    (v) => entries.some((e) => e.name === v),
    () => entries[0]?.name ?? null
  );

  if (!currentAgent) return null;

  const selected = entries.find((e) => e.name === selection);

  return (
    <ListState isLoading={skills === null} error={error} onRetry={load}>
      <div className="flex h-full w-full overflow-hidden">
        <SkillListPanel
          agentId={currentAgent.id}
          entries={entries}
          selection={selection}
          onSelect={(name) => {
            logger.info('[Skills] 选中技能', { name });
            setSelection(name);
          }}
        />
        {selected ? (
          <div className="min-h-0 min-w-0 flex-1">
            <SkillDetailPanel skill={selected} />
          </div>
        ) : (
          <EmptyPane text={t('skills.noneSelected')} />
        )}
      </div>
    </ListState>
  );
};
