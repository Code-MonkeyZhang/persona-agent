/**
 * @file src/renderer/components/agent-editor/WorkspaceCard.tsx
 * @description 工作空间卡片，默认工作目录选择
 */

import React from 'react';
import { Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WorkspaceSelector } from '../common/WorkspaceSelector';
import { SettingRow } from '../common/SettingRow';
import { Card } from '../ui/Card';

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
    <Card title={t('agentEditor.workspace')} icon={Folder}>
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
    </Card>
  );
};
