/**
 * @file src/renderer/components/common/UninstallButton.tsx
 * @description 详情底部的红色危险卸载按钮，点击在按钮上方弹出二次确认菜单
 */

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UninstallButtonProps {
  onUninstall: () => void;
  /** 确认菜单的提示文案，由调用方按场景给出 */
  hint: string;
}

export function UninstallButton({ onUninstall, hint }: UninstallButtonProps) {
  const { t } = useTranslation();
  /** 二次确认菜单的开关态，点遮罩或取消即收起 */
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="relative flex justify-center pt-1">
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 px-3 text-caption text-red-500 transition-colors hover:border-red-300 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t('marketplace.uninstall')}
      </button>
      {confirming && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setConfirming(false)}
          />
          <div className="absolute bottom-full left-1/2 z-20 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border bg-white p-3 shadow-lg">
            <p className="text-caption text-muted-foreground">{hint}</p>
            <div className="mt-2.5 flex justify-end gap-1">
              <button
                onClick={() => setConfirming(false)}
                className="h-7 rounded-lg px-2.5 text-caption text-muted-foreground transition-colors hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={onUninstall}
                className="h-7 rounded-lg bg-red-500 px-2.5 text-caption text-white transition-colors hover:bg-red-600"
              >
                {t('marketplace.uninstall')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
