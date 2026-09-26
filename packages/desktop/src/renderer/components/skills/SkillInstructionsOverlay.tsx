/**
 * @file src/renderer/components/skills/SkillInstructionsOverlay.tsx
 * @description 技能正文全屏阅读浮层
 * 居中大卡片带标题与复制按钮，ESC 或点遮罩关闭，正文通篇滚动
 */

import { useTranslation } from 'react-i18next';
import type { SkillInfo } from '../../lib/api';
import { Dialog, DialogContent, DialogTitle } from '../ui/Dialog';
import { CopyButton } from '../ui/CopyButton';
import { ScrollArea } from '../ui/ScrollArea';
import { Markdown } from '../common/Markdown';

interface SkillInstructionsOverlayProps {
  skill: SkillInfo;
  content: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SkillInstructionsOverlay({
  skill,
  content,
  open,
  onOpenChange,
}: SkillInstructionsOverlayProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-[720px] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3 pr-12">
          <div className="min-w-0">
            <DialogTitle className="truncate text-body font-bold text-foreground">
              {skill.displayName ?? skill.name}
            </DialogTitle>
            <p className="mt-0.5 text-micro text-muted-foreground">
              {t('skills.sectionContent')}
            </p>
          </div>
          <CopyButton
            text={content}
            title={t('common.copy')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-4">
            <Markdown content={content} className="text-content" />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
