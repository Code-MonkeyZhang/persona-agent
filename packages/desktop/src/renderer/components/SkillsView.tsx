/**
 * @file components/SkillsView.tsx
 * @description Agent 技能视图，独立于 AgentEditor，采用草稿+保存模式。
 * 从 currentAgent.skillNames 初始化草稿，保存后调 updateAgentSkillNames 写入后端。
 * 两段式布局：上半「已分配」+ 下半「技能库」，放弃下拉菜单。
 */
import React, { useState, useEffect } from 'react';
import { Plus, X, Sparkles, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listSkills, type SkillInfo } from '../lib/api';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import { logger } from '../lib/logger';
import { ScrollArea } from './ui/ScrollArea';
import { BackButton } from './ui/BackButton';
import { CollapsibleSection } from './ui/CollapsibleSection';

export const SkillsView: React.FC = () => {
  const { t } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);
  const updateAgentSkillNames = useAgentStore((s) => s.updateAgentSkillNames);
  const setActiveNav = useViewStore((s) => s.setActiveNav);

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(
    currentAgent?.skillNames ?? []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);

  useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch((err) => logger.error('Failed to load skills:', err));
  }, []);

  /** Agent 切换时重新初始化草稿 */
  useEffect(() => {
    setSelectedSkillIds(currentAgent?.skillNames ?? []);
  }, [currentAgent?.id]);

  /** 技能库 = 全部技能中未被当前 Agent 选中的 */
  const librarySkills = skills.filter(
    (s) => !selectedSkillIds.includes(s.name)
  );

  /** 保存当前 Skill 分配到后端，成功后返回聊天视图 */
  const handleSave = async () => {
    if (!currentAgent) return;
    setIsSaving(true);
    try {
      await updateAgentSkillNames(currentAgent.id, selectedSkillIds);
      setActiveNav('chat');
    } catch (err) {
      logger.error('Failed to save skill names:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /** 根据 ID 查找技能信息 */
  const resolveSkill = (name: string): SkillInfo | undefined =>
    skills.find((s) => s.name === name);

  return (
    <div className="h-full w-full flex flex-col bg-general-bg">
      <div className="shrink-0 flex items-center gap-2 px-5 h-14 border-b border-border bg-muted">
        <BackButton onClick={() => setActiveNav('chat')} />
        <Sparkles className="w-4 h-4 text-muted-foreground" />
        <h1 className="text-[16px] font-bold text-foreground">
          {t('skills.viewTitle')}
        </h1>
        <div className="flex-1" />
        <button
          onClick={() => setActiveNav('marketplace')}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-blue-200 text-blue-600 bg-background hover:bg-blue-50 transition-colors text-[13px]"
        >
          <Compass className="w-4 h-4" />
          {t('marketplace.entry')}
        </button>
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
            {/* 已分配技能 */}
            <CollapsibleSection
              title={t('skills.assignedTo', { name: currentAgent?.name ?? '' })}
              count={selectedSkillIds.length}
              open={assignedOpen}
              onToggle={() => setAssignedOpen(!assignedOpen)}
            >
              {selectedSkillIds.length === 0 ? (
                <div className="px-1 py-3 text-[12px] text-muted-foreground/60">
                  {t('skills.emptyAssigned')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1 pb-2">
                  {selectedSkillIds.map((skillId) => {
                    const skill = resolveSkill(skillId);
                    return (
                      <div
                        key={skillId}
                        className="group relative flex items-center gap-2.5 px-3 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-foreground truncate">
                            {skill?.name || skillId}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {skill?.description || ''}
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setSelectedSkillIds(
                              selectedSkillIds.filter((id) => id !== skillId)
                            )
                          }
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground/60 hover:bg-black/5 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                          title={t('skills.remove')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleSection>

            {/* 技能库 */}
            <CollapsibleSection
              title={t('skills.library')}
              count={librarySkills.length}
              open={libraryOpen}
              onToggle={() => setLibraryOpen(!libraryOpen)}
            >
              {librarySkills.length === 0 ? (
                <div className="px-1 py-3 text-[12px] text-muted-foreground/60">
                  {t('skills.emptyLibrary')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1 pb-2">
                  {librarySkills.map((skill) => (
                    <div
                      key={skill.name}
                      className="group relative flex items-center gap-2.5 px-3 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-foreground truncate">
                          {skill.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {skill.description || ''}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setSelectedSkillIds([...selectedSkillIds, skill.name])
                        }
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title={t('skills.assign')}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
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
