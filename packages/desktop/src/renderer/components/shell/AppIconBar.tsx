/**
 * @file src/renderer/components/shell/AppIconBar.tsx
 * @description 最右侧 Agent App 图标栏。加载 agentApp 列表后渲染为 72px 竖列，
 * 点击图标选中/取消选中对应的 App 面板。
 */

import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { getBaseUrl } from '../../lib/api';
import { useAppPanelStore } from '../../stores/appPanelStore';

export const AppIconBar: React.FC = () => {
  const { apps, selectedApp, selectApp, loadApps, sidebarVisible } =
    useAppPanelStore();
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    void getBaseUrl().then(setBaseUrl);
    void loadApps();
  }, [loadApps]);

  if (!sidebarVisible || apps.length === 0) return null;

  return (
    <aside className="w-[72px] h-full bg-muted border-l border-border flex flex-col shrink-0">
      <div className="flex-1 overflow-y-auto py-2">
        {apps.map((app) => {
          const isSelected = selectedApp === app.name;
          return (
            <button
              key={app.name}
              onClick={() => selectApp(isSelected ? null : app.name)}
              title={app.name}
              className="w-full py-3 flex flex-col items-center"
            >
              <div
                className={cn(
                  'relative w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden border-2 transition-colors',
                  isSelected
                    ? 'border-primary bg-background shadow-sm'
                    : 'border-transparent bg-secondary'
                )}
              >
                <span className="text-sm font-medium text-muted-foreground">
                  {app.name.charAt(0).toUpperCase()}
                </span>
                {baseUrl && (
                  <img
                    src={`${baseUrl}/apps/${app.name}/icon.png`}
                    alt={app.name}
                    className="absolute w-10 h-10 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
