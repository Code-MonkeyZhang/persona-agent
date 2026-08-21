/**
 * @file src/renderer/components/agent-editor/AppearanceCard.tsx
 * @description 形象卡片，立绘列表与背景图管理
 */

import React, { useState } from 'react';
import { VenetianMask } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingDivider } from '../common/SettingRow';
import { HoverDeleteButton } from '../ui/HoverDeleteButton';
import { ImagePreviewOverlay } from '../ui/ImagePreviewOverlay';
import { ImageAddTile } from '../ui/ImageAddTile';
import { Card } from '../ui/Card';
import { LabelWithTooltip } from '../common/LabelWithTooltip';
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

  return (
    <Card title={t('agentEditor.appearance')} icon={VenetianMask}>
      <LabelWithTooltip
        label={t('agentEditor.poseImage')}
        tooltip={t('agentEditor.poseTooltip')}
        className="text-[13px] mb-2"
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
        className="text-[13px] mb-2"
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
        <ImageAddTile width={90} height={160} onPick={onBgUpload} />
      )}
    </Card>
  );
};
