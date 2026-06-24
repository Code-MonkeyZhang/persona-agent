/**
 * @file src/renderer/components/SkillListTab.tsx
 * @description Skills 列表标签页，展示后端已注册的技能模块名称和描述，并支持卸载
 * 使用 2 列网格卡片的 Demo 视觉风格
 */

import React, { useEffect, useState } from 'react';
import { FolderOpen, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listSkills, uninstallSkill, type SkillInfo } from '../lib/api';
import { toast } from '../stores/toastStore';
import { ListState } from './ListState';

/**
 * Skills 列表标签页组件，从后端加载可用技能列表并展示名称和描述，支持卸载
 */
export const SkillListTab: React.FC = () => {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 待卸载的 Skill */
  const [uninstallTarget, setUninstallTarget] = useState<SkillInfo | null>(
    null
  );
  const [isUninstalling, setIsUninstalling] = useState(false);

  useEffect(() => {
    loadSkills();
  }, []);

  /**
   * 从后端拉取 Skills 列表并更新本地状态
   */
  const loadSkills = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listSkills();
      setSkills(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skills.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 确认卸载：调后端删除该 Skill 的本地文件夹，成功后刷新列表并提示
   */
  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return;
    setIsUninstalling(true);
    try {
      await uninstallSkill(uninstallTarget.name);
      await loadSkills();
      toast.success(
        t('marketplace.uninstallSuccess', { name: uninstallTarget.name })
      );
      setUninstallTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setIsUninstalling(false);
    }
  };

  return (
    <>
      <ListState isLoading={isLoading} error={error} onRetry={loadSkills}>
        <div className="p-5">
          <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[14px] font-bold text-[#333]">Skills</h3>
              <button
                onClick={() =>
                  window.api?.openPath('~/.local/share/persona-agent/skills/')
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-[#555] border border-[#ddd] bg-white hover:bg-[#f0f0f0] hover:border-[#bbb] transition-colors shadow-sm"
              >
                <FolderOpen className="w-4 h-4" />
                {t('common.openDirectory')}
              </button>
            </div>
            <p className="text-[12px] text-[#999] mb-4">{t('skills.desc')}</p>

            {skills.length === 0 ? (
              <div className="text-[#ccc] text-[13px] py-4 text-center">
                {t('skills.empty')}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="group flex items-center gap-2 px-3 py-3 rounded-xl border border-[#eee] bg-[#fafafa] text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-[#333] truncate">
                        {skill.name}
                      </div>
                      {skill.description && (
                        <div className="text-[11px] text-[#999] truncate mt-0.5">
                          {skill.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setUninstallTarget(skill)}
                      className="shrink-0 flex items-center gap-1 h-7 px-2.5 text-[11px] rounded-lg border border-[#ddd] text-[#666] hover:bg-[#f0f0f0] hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('marketplace.uninstall')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ListState>

      {/* 卸载二次确认弹窗 */}
      {uninstallTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center"
          onClick={() => !isUninstalling && setUninstallTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-6 p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold text-[#333]">
              {t('marketplace.uninstall')}
            </h3>
            <p className="text-[13px] text-[#666] leading-relaxed">
              {t('marketplace.uninstallConfirm', {
                name: uninstallTarget.name,
              })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setUninstallTarget(null)}
                disabled={isUninstalling}
                className="h-8 px-4 rounded-lg text-[13px] text-[#555] border border-[#ddd] hover:bg-[#f0f0f0] disabled:opacity-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmUninstall}
                disabled={isUninstalling}
                className="h-8 px-4 rounded-lg text-[13px] text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center gap-1 transition-colors"
              >
                {isUninstalling && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {t('marketplace.uninstall')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
