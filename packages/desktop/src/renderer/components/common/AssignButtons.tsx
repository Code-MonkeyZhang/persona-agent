/**
 * @file src/renderer/components/common/AssignButtons.tsx
 * @description 行尾的分配加号与解绑减号按钮
 */

import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** 行尾分配按钮，方角加号，hover 泛主色 */
export function AssignButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      title={t('common.assign')}
      className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}

/** 行尾解绑按钮，圆形减号，hover 泛灰 */
export function UnassignButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      title={t('common.remove')}
      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5"
    >
      <Minus className="h-3.5 w-3.5" />
    </button>
  );
}
