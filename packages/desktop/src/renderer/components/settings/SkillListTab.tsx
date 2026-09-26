/**
 * @file src/renderer/components/settings/SkillListTab.tsx
 * @description 设置页「已安装技能」面板，左列表右详情的技能管理
 * 左栏平铺全部已装技能的卡片，行尾无动作，卸载在详情里完成
 */

import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { logger } from '../../lib/logger';
import { dataPath } from '../../lib/platform';
import { ListState } from '../common/ListState';
import {
  SidePanelShell,
  SidePanelHeader,
  EmptyHint,
} from '../common/SidePanel';
import { SkillRow } from '../skills/SkillListPanel';
import { SkillDetailPanel } from '../skills/SkillDetailPanel';
import { useValidatedSelection } from '../../hooks/useValidatedSelection';

export const SkillListTab: React.FC = () => {
  const { t } = useTranslation();
  const skills = useMarketplaceStore((s) => s.skillsManage);
  const isLoading = useMarketplaceStore((s) => s.skillsManageLoading);
  const error = useMarketplaceStore((s) => s.skillsManageError);
  const loadSkillManage = useMarketplaceStore((s) => s.loadSkillManage);
  const uninstallSkillItem = useMarketplaceStore((s) => s.uninstallSkillItem);

  useEffect(() => {
    loadSkillManage();
  }, [loadSkillManage]);

  /**
   * 选中技能失效时自动修正，回退到列表第一个技能，全部卸载完悬空显示占位。
   * 卸载选中技能与首次进入由这一处逻辑覆盖。
   */
  const [selection, setSelection] = useValidatedSelection<string>(
    (v) => skills.some((e) => e.name === v),
    () => skills[0]?.name ?? null
  );

  const handleSelect = (name: string) => {
    logger.info('[Skills] 设置页选中技能', { name });
    setSelection(name);
  };

  const selected = skills.find((e) => e.name === selection);

  return (
    <ListState isLoading={isLoading} error={error} onRetry={loadSkillManage}>
      <div className="h-full overflow-hidden p-5">
        <div className="flex h-full overflow-hidden rounded-xl border border-border bg-white">
          {/* 左栏，技能卡片平铺，滚动条隐藏并带上下边缘渐隐 */}
          <SidePanelShell
            width="w-64"
            padY="pt-3 pb-3"
            header={
              <SidePanelHeader
                icon={Sparkles}
                titleKey="skills.title"
                openDirKey="common.openDirectory"
                onOpenDir={() => window.api?.openPath(dataPath('skills'))}
              />
            }
          >
            {skills.length === 0 ? (
              <EmptyHint text={t('skills.empty')} />
            ) : (
              skills.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  selected={selection === skill.name}
                  onClick={() => handleSelect(skill.name)}
                />
              ))
            )}
          </SidePanelShell>

          {/* 右栏，共享详情，key 切换时重挂载以复位全屏阅读与确认态 */}
          <div className="min-h-0 min-w-0 flex-1">
            {selected ? (
              <SkillDetailPanel
                key={selected.name}
                skill={selected}
                onUninstall={(name) =>
                  uninstallSkillItem(name).catch(() => {
                    // store 已弹 toast，这里吞掉异常保持确认态供重试
                  })
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center text-body text-muted-foreground">
                {t('skills.noneSelected')}
              </div>
            )}
          </div>
        </div>
      </div>
    </ListState>
  );
};
