/**
 * @file src/renderer/components/agent-editor/WorkspaceCard.tsx
 * @description 工作空间卡片，默认工作目录选择
 */

import React from 'react';
import { Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WorkspaceSelector } from '../common/WorkspaceSelector';
import { SettingRow } from '../common/SettingRow';

interface WorkspaceCardProps {
  value?: string;
  onChange: (path: string | undefined) => void;
}

/** 工作空间卡片：默认工作目录选择 */
export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-background px-4 py-4">
      <h3 className="text-[14px] font-bold text-foreground mb-3">
        <Folder className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-muted-foreground" />
        {t('agentEditor.workspace')}
      </h3>
      <SettingRow
        label={t('agentEditor.defaultWorkspace')}
        tooltip={t('agentEditor.defaultWorkspaceDesc')}
      >
        <WorkspaceSelector
          value={value}
          onChange={onChange}
          placeholder={t('agentEditor.defaultWorkspacePlaceholder')}
        />
      </SettingRow>
    </div>
  );
};
