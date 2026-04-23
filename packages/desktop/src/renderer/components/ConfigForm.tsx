/**
 * @file src/renderer/components/ConfigForm.tsx
 * @description 应用通用配置表单，包括日志开关设置
 */

import React from 'react';
import { useConfigStore } from '../stores/configStore';

/**
 * 通用配置表单组件，提供日志启用开关
 */
export const ConfigForm: React.FC = () => {
  const { config, updateField } = useConfigStore();

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
    </div>
  );
};
