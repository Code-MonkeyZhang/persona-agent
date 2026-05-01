/**
 * @file src/renderer/components/ConfigForm.tsx
 * @description 应用通用配置表单，包括日志开关和存储路径展示
 * 使用卡片分组 + Switch 组件 + SettingRow 统一行布局
 */

import React from 'react';
import { useConfigStore } from '../stores/configStore';
import { Switch } from './ui/Switch';
import { SettingRow, SettingDivider } from './SettingRow';

function PathRow({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex items-center justify-between min-h-[32px] gap-4">
      <div className="min-w-0">
        <div className="text-[14px] text-[#333] leading-[18px]">{label}</div>
        <div className="text-[12px] text-[#999] font-mono truncate">{path}</div>
      </div>
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
        <PathRow label="配置文件" path="~/.nano-agent/config/config.yaml" />
        <SettingDivider />
        <PathRow label="数据目录" path="~/.nano-agent/data/" />
        <SettingDivider />
        <PathRow label="技能目录" path="~/.nano-agent/skills/" />
        <SettingDivider />
        <PathRow label="MCP 配置" path="~/.nano-agent/config/mcp.json" />
        <SettingDivider />
        <PathRow label="日志目录" path="~/.nano-agent/logs/" />
      </div>
    </div>
  );
};
