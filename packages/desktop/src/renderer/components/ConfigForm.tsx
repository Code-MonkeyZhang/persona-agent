/**
 * @file src/renderer/components/ConfigForm.tsx
 * @description 应用通用配置表单，包括日志开关和存储路径展示
 * 使用卡片分组 + Switch 组件 + SettingRow 统一行布局
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useConfigStore } from '../stores/configStore';
import { Switch } from './ui/Switch';
import { SettingRow, SettingDivider } from './SettingRow';

const STORAGE_PATHS = [
  { label: '智能体目录', path: '~/.local/share/persona-agent/agents/' },
  { label: '技能目录', path: '~/.local/share/persona-agent/skills/' },
  { label: 'MCP 配置', path: '~/.local/share/persona-agent/mcp/' },
  { label: '日志目录', path: '~/.local/share/persona-agent/logs/' },
] as const;

function PathRow({ label, path }: { label: string; path: string }) {
  const handleOpen = () => {
    window.api?.openPath(path);
  };

  return (
    <div className="flex items-center justify-between min-h-[32px] gap-4">
      <div className="min-w-0">
        <div className="text-[14px] text-[#333] leading-[18px]">{label}</div>
        <div className="text-[12px] text-[#999] font-mono truncate">{path}</div>
      </div>
      <button
        onClick={handleOpen}
        className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-[#999] hover:text-[#333] hover:bg-[#f5f5f5] transition-colors"
      >
        <FolderOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * 通用配置表单组件，提供日志启用开关和存储路径展示
 */
export const ConfigForm: React.FC = () => {
  const { config, updateField, saveConfig } = useConfigStore();

  if (!config) return null;

  /**
   * 切换开关并即时持久化到后端，失败时回滚
   */
  const handleToggle = async (field: 'enableLogging', value: boolean) => {
    const prev = config[field];
    updateField(field, value);
    try {
      await saveConfig({ ...config, [field]: value });
    } catch {
      updateField(field, prev);
    }
  };

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-[#333] mb-3">基本</h3>
        <SettingRow label="启用日志" desc="将运行日志记录到本地文件">
          <Switch
            checked={config.enableLogging}
            onCheckedChange={(checked) =>
              handleToggle('enableLogging', checked)
            }
          />
        </SettingRow>
      </div>

      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-[#333] mb-3">存储路径</h3>
        {STORAGE_PATHS.map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <SettingDivider />}
            <PathRow label={item.label} path={item.path} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
