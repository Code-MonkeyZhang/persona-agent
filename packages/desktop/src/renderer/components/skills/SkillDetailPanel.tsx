/**
 * @file src/renderer/components/skills/SkillDetailPanel.tsx
 * @description 技能页右栏详情
 * 头部与其他详情页共用 IntroHead，行尾放打开目录按钮
 * 基本信息卡按名称、技能 ID、简介、作者的定序收进白底卡
 * 正文按需单查，内容区 markdown 限高滚动加全屏阅读入口
 */

import { useEffect, useState } from 'react';
import { FolderOpen, Maximize2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSkill, type SkillInfo } from '../../lib/api';
import { logger } from '../../lib/logger';
import { Markdown } from '../common/Markdown';
import {
  DetailRow,
  DetailSection,
  DetailTable,
  DocBox,
  SectionHint,
} from '../common/DetailSection';
import { IntroHead } from '../common/IntroHead';
import { UninstallButton } from '../common/UninstallButton';
import { ScrollArea } from '../ui/ScrollArea';
import { MarketplaceLogo } from '../marketplace/MarketplaceLogo';
import { SkillInstructionsOverlay } from './SkillInstructionsOverlay';

interface SkillDetailPanelProps {
  skill: SkillInfo;
  /** 仅设置页传入，详情底部显示卸载按钮 */
  onUninstall?: (name: string) => void;
}

export function SkillDetailPanel({
  skill,
  onUninstall,
}: SkillDetailPanelProps) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  /** 正文按需单查，切换技能时复位重取，卸载防止过期响应写入新状态 */
  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setLoadError(false);
    getSkill(skill.name)
      .then((detail) => {
        if (!cancelled) setContent(detail.content);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error(`[Skills] Failed to load content of ${skill.name}:`, err);
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [skill.name]);

  const handleOpenDir = () => {
    logger.info('[Skills] 打开技能目录', { location: skill.location });
    window.api?.openPath(skill.location);
  };

  return (
    <ScrollArea className="h-full bg-general-bg">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        {/* 头部，与其他详情页共用 IntroHead，缺图兜底技能图标，行尾是打开目录动作 */}
        <IntroHead
          icon={
            <MarketplaceLogo
              logoUrl={skill.logoUrl}
              name={skill.displayName ?? skill.name}
              fallbackIcon={Sparkles}
              size="lg"
            />
          }
          name={skill.displayName ?? skill.name}
          desc={skill.description}
          action={
            <button
              onClick={handleOpenDir}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-caption text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('common.openDirectory')}
            </button>
          }
        />

        {/* 基本信息段，键值行收进白底卡，名称永远显示并在缺失时回退技能 ID，技能 ID 与作者缺省时省略对应行 */}
        <DetailSection title={t('skills.sectionBasic')}>
          <DetailTable>
            <DetailRow label={t('skills.fieldDisplayName')}>
              {skill.displayName ?? skill.name}
            </DetailRow>
            {skill.displayName && skill.displayName !== skill.name && (
              <DetailRow label={t('skills.fieldSlug')}>
                <span className="font-mono">{skill.name}</span>
              </DetailRow>
            )}
            <DetailRow label={t('skills.fieldIntro')}>
              <p className="whitespace-pre-wrap">{skill.description}</p>
            </DetailRow>
            {skill.author && (
              <DetailRow label={t('skills.fieldAuthor')}>
                @{skill.author}
              </DetailRow>
            )}
          </DetailTable>
        </DetailSection>

        {/* 内容段，限高内部滚动，标题行尾进全屏阅读 */}
        <DetailSection
          title={t('skills.sectionContent')}
          extra={
            <button
              onClick={() => setFullscreen(true)}
              title={t('skills.openFullscreen')}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          }
        >
          {loadError ? (
            <SectionHint text={t('skills.loadFailed')} />
          ) : content === null ? null : content ? (
            <div className="max-h-[420px] overflow-y-auto">
              <DocBox>
                <Markdown content={content} className="text-content" />
              </DocBox>
            </div>
          ) : (
            <SectionHint text={t('skills.instructionsMissing')} />
          )}
        </DetailSection>

        {onUninstall && (
          <UninstallButton
            onUninstall={() => onUninstall(skill.name)}
            hint={t('skills.confirmUninstall')}
          />
        )}
      </div>

      <SkillInstructionsOverlay
        skill={skill}
        content={content ?? ''}
        open={fullscreen}
        onOpenChange={setFullscreen}
      />
    </ScrollArea>
  );
}
