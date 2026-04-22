/**
 * @file src/renderer/components/ConfigForm.tsx
 * @description 应用通用配置表单，包括日志开关和退出行为设置
 */

import React, { useEffect, useState } from 'react';
import { useConfigStore } from '../stores/configStore';

/**
 * 通用配置表单组件，提供日志启用和退出时关闭服务器两项开关
 */
export const ConfigForm: React.FC = () => {
  const { config, updateField } = useConfigStore();
  const [killServerOnExit, setKillServerOnExit] = useState(false);

  useEffect(() => {
    window.api?.getDesktopConfig().then((c) => {
      setKillServerOnExit(c.killServerOnExit);
    });
  }, []);

  /**
   * 切换"退出时关闭服务器"开关，同步更新本地状态并持久化到桌面配置
   * @param checked 是否启用退出时关闭服务器
   */
  const handleKillServerToggle = async (checked: boolean) => {
    setKillServerOnExit(checked);
    await window.api?.setDesktopConfig({ killServerOnExit: checked });
  };

  if (!config) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900">日志</h3>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={config.enableLogging}
              onChange={(e) => updateField('enableLogging', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label className="ml-2 text-sm text-gray-700">启用日志</label>
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900">退出行为</h3>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={killServerOnExit}
              onChange={(e) => handleKillServerToggle(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="ml-2">
              <label className="text-sm text-gray-700">退出时关闭服务器</label>
              <p className="text-xs text-gray-500 mt-0.5">
                启用后，关闭桌面应用时会自动停止后台运行的服务器进程
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
