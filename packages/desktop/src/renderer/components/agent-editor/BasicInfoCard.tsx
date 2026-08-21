/**
 * @file src/renderer/components/agent-editor/BasicInfoCard.tsx
 * @description 基本信息卡片，头像上传与名称、简介编辑
 */

import React from 'react';
import { Camera, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '../common/AgentAvatar';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { useImageFileInput } from '../../hooks/useImageFileInput';
import type { AgentConfig } from '../../types/agent';

interface BasicInfoCardProps {
  previewAgent: AgentConfig;
  avatarPreviewUrl?: string;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onAvatarUpload: (file: File, dataUrl: string) => void;
}

/**
 * 基本信息卡片：点击头像选择新图片，
 * 读取为 base64 后连同原始文件一并上抛给父组件暂存。
 */
export const BasicInfoCard: React.FC<BasicInfoCardProps> = ({
  previewAgent,
  avatarPreviewUrl,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  onAvatarUpload,
}) => {
  const { t } = useTranslation();
  const { inputRef, handleChange } = useImageFileInput(onAvatarUpload);

  return (
    <Card title={t('agentEditor.basicInfo')} icon={PenLine}>
      <div className="flex items-start gap-4">
        <div
          className="relative group cursor-pointer shrink-0 pt-0.5"
          onClick={() => inputRef.current?.click()}
        >
          <AgentAvatar
            agent={previewAgent}
            size="lg"
            editingPreviewUrl={avatarPreviewUrl}
          />
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif"
            onChange={handleChange}
            className="hidden"
          />
        </div>
        <div className="flex-1 flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted-foreground shrink-0 w-12">
              {t('agentEditor.name')}
            </span>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('agentEditor.namePlaceholder')}
              className="rounded-lg border-border h-8 flex-1 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted-foreground shrink-0 w-12">
              {t('agentEditor.description')}
            </span>
            <Input
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={t('agentEditor.descPlaceholder')}
              className="rounded-lg border-border h-8 flex-1 text-[13px]"
            />
          </div>
        </div>
      </div>
    </Card>
  );
};
