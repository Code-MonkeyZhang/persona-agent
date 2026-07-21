/**
 * @file components/ScrollToBottomButton.tsx
 * @description 滚动到底部悬浮按钮，离开底部时淡入显示，点击平滑滚至底部
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ScrollToBottomButtonProps {
  /** 是否显示按钮，由父组件依据滚动位置决定 */
  visible: boolean;
  /** 点击后触发的滚动回调 */
  onClick: () => void;
  /** 距容器底部的额外偏移，用于避开浮层；默认 0 仅保留基础间距 */
  bottomOffset?: number;
}

/**
 * 滚动到底部悬浮按钮
 * - 由父组件通过 visible 控制显隐
 * - 内部用 framer-motion 做淡入与上滑过渡
 */
export function ScrollToBottomButton({
  visible,
  onClick,
  bottomOffset = 0,
}: ScrollToBottomButtonProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={onClick}
          aria-label={t('messageList.scrollToBottom')}
          style={{ bottom: bottomOffset + 16 }}
          className="absolute right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border/40 bg-background/90 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
          initial={{ opacity: 0, y: 8 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.2, ease: 'easeOut' },
          }}
          exit={{
            opacity: 0,
            y: 8,
            transition: { duration: 0.15, ease: 'easeIn' },
          }}
        >
          <ArrowDown className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
