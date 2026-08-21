/**
 * @file src/renderer/components/common/ListState.tsx
 * @description 列表加载/错误状态展示组件，统一处理 loading spinner 和 error 重试
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ListStateProps {
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  children?: React.ReactNode;
}

/**
 * 列表加载/错误状态展示组件。
 * loading 时显示 spinner，error 时显示错误信息和重试按钮，否则渲染 children。
 */
export const ListState: React.FC<ListStateProps> = ({
  isLoading,
  error,
  onRetry,
  children,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="p-5">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-xl border border-border bg-white px-4 py-4 text-center">
          <p className="text-red-500">
            {t('common.loadFailed')}: {error}
          </p>
          <button
            onClick={onRetry}
            className="mt-2 text-[13px] text-muted-foreground hover:text-foreground"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
