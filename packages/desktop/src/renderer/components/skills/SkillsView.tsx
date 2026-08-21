/**
 * @file src/renderer/components/skills/SkillsView.tsx
 * @description Agent 技能视图，独立于 AgentEditor，采用草稿+保存模式。
 * 从 currentAgent.skillNames 初始化草稿，保存后调 updateAgentSkillNames 写入后端。
 * 两段式布局：上半「已分配」+ 下半「技能库」，行渲染统一用 AssignRow。
 *
 * 商城入口已收口到左下角罗盘，本页不再提供"技能商城"按钮；要装新的技能去罗盘。
 */
import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listSkills, type SkillInfo } from '../../lib/api';
import { useAgentStore } from '../../stores/agentStore';
import { useViewStore } from '../../stores/viewStore';
import { logger } from '../../lib/logger';
import { ScrollArea } from '../ui/ScrollArea';
import { BackButton } from '../ui/BackButton';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { AssignRow } from '../common/AssignRow';

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
      logger.info(
        `[Skills] Saved skill assignment for ${currentAgent.id}: ${selectedSkillIds.join(', ')}`
      );
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
                      <AssignRow
                        key={skillId}
                        type="skill"
                        variant="assigned"
                        name={skill?.name || skillId}
                        description={skill?.description}
                        onAction={() =>
                          setSelectedSkillIds(
                            selectedSkillIds.filter((id) => id !== skillId)
                          )
                        }
                      />
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
                    <AssignRow
                      key={skill.name}
                      type="skill"
                      variant="available"
                      name={skill.name}
                      description={skill.description}
                      onAction={() =>
                        setSelectedSkillIds([...selectedSkillIds, skill.name])
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
