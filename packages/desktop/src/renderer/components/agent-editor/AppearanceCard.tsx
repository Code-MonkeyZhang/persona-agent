/**
 * @file src/renderer/components/agent-editor/AppearanceCard.tsx
 * @description 形象卡片，立绘列表与背景图管理
 */

import React, { useRef, useState } from 'react';
import { Plus, VenetianMask } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { readFileAsDataURL } from '../../lib/utils';
import { SettingDivider } from '../common/SettingRow';
import { HoverDeleteButton } from '../ui/HoverDeleteButton';
import { ImagePreviewOverlay } from '../ui/ImagePreviewOverlay';
import { LabelWithTooltip } from '../ui/LabelWithTooltip';
import { PoseImageCardList } from './PoseImageCardList';
import type { PoseImage } from './PoseImageCardList';

interface AppearanceCardProps {
  agentId: string | null;
  poseImages: PoseImage[];
  onPoseAdd: (file: File, dataUrl: string, name: string) => void;
  onPoseRemove: (index: number) => void;
  onPoseRename: (index: number, newName: string) => void;
  bgPreviewUrl?: string;
  onBgUpload: (file: File, dataUrl: string) => void;
  onBgRemove: () => void;
  onBgPreviewError: () => void;
}

/**
 * 形象卡片：立绘列表与背景图预览。
 * 背景文件在本卡片内读取为 base64 后上抛，放大预览状态自持。
 */
export const AppearanceCard: React.FC<AppearanceCardProps> = ({
  agentId,
  poseImages,
  onPoseAdd,
  onPoseRemove,
  onPoseRename,
  bgPreviewUrl,
  onBgUpload,
  onBgRemove,
  onBgPreviewError,
}) => {
  const { t } = useTranslation();
  const [bgPreviewOpen, setBgPreviewOpen] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    onBgUpload(file, dataUrl);
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border border-border bg-background px-4 py-4">
      <h3 className="text-[14px] font-bold text-foreground mb-3">
        <VenetianMask className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-muted-foreground" />
        {t('agentEditor.appearance')}
      </h3>

      <LabelWithTooltip
        label={t('agentEditor.poseImage')}
        tooltip={t('agentEditor.poseTooltip')}
      />
      <PoseImageCardList
        images={poseImages}
        onAdd={onPoseAdd}
        onRemove={onPoseRemove}
        onRename={onPoseRename}
        agentId={agentId}
      />

      <SettingDivider />

      <LabelWithTooltip
        label={t('agentEditor.backgroundImage')}
        tooltip={t('agentEditor.bgTooltip')}
      />
      {bgPreviewUrl ? (
        <div className="relative group inline-block">
          <div
            className="relative rounded-lg overflow-hidden cursor-pointer"
            style={{ width: 90, height: 160 }}
            onClick={() => setBgPreviewOpen(true)}
          >
            <img
              src={bgPreviewUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={onBgPreviewError}
            />
          </div>
          <HoverDeleteButton
            variant="dark"
            className="absolute top-1 right-1"
            onClick={onBgRemove}
          />
          {bgPreviewOpen && (
            <ImagePreviewOverlay
              src={bgPreviewUrl}
              onClose={() => setBgPreviewOpen(false)}
            />
          )}
        </div>
      ) : (
        <div className="inline-block">
          <div
            className="rounded-lg border border-dashed border-border bg-muted flex items-center justify-center cursor-pointer hover:border-muted-foreground transition-colors"
            style={{ width: 90, height: 160 }}
            onClick={() => bgInputRef.current?.click()}
          >
            <Plus className="w-5 h-5 text-muted-foreground" />
          </div>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif"
            onChange={handleBgUpload}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
};
