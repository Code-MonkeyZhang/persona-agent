/**
 * @file src/renderer/components/SkillListTab.tsx
 * @description 设置页 Skills 标签页外壳：标题 + "打开目录"按钮 + 管理行列表。
 * 已装列表与卸载逻辑在 useMarketplaceStore，行渲染用 ManageRow（行内二次确认）。
 */

import React, { useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { ListState } from './ListState';
import { ManageRow } from './cards/ManageRow';

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

  return (
    <ListState isLoading={isLoading} error={error} onRetry={loadSkillManage}>
      <div className="p-5">
        <div className="rounded-xl border border-border bg-white px-4 py-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[14px] font-bold text-foreground">Skills</h3>
            <button
              onClick={() =>
                window.api?.openPath('~/.local/share/persona-agent/skills/')
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground border border-border bg-white hover:bg-secondary transition-colors shadow-sm"
            >
              <FolderOpen className="w-4 h-4" />
              {t('common.openDirectory')}
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            {t('skills.desc')}
          </p>

          {skills.length === 0 ? (
            <div className="text-placeholder text-[13px] py-4 text-center">
              {t('skills.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {skills.map((skill) => (
                <ManageRow
                  key={skill.name}
                  type="skill"
                  skill={skill}
                  onUninstall={() => uninstallSkillItem(skill.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ListState>
  );
};
