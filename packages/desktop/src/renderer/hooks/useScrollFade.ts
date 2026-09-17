/**
 * @file src/renderer/hooks/useScrollFade.ts
 * @description 竖向滚动渐隐 hook，为隐藏滚动条的容器提供滚动位置指示
 */

import { useCallback, useMemo, useRef, useState } from 'react';

const DEFAULT_FADE_SIZE = 48;
/** 中间 stop 的不透明度与位置比例，前半段保持低透明度再快速恢复，边缘隐没感更强 */
const MID_OPACITY = 0.35;
const MID_RATIO = 0.55;

/**
 * 监听滚动位置与尺寸变化，动态生成上下边缘的 CSS mask。
 * - 尚有内容可滚的一侧保持渐隐遮罩，到达顶部或底部时对应侧遮罩消失
 * - 滚动监听 passive，ResizeObserver 同时观察容器与首个子元素，覆盖条目增删
 * @param fadeSize - 遮罩渐隐区高度，单位 px
 */
export function useScrollFade(fadeSize = DEFAULT_FADE_SIZE) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  /** 卸载清理函数，callback ref 重建或卸载时执行 */
  const cleanupRef = useRef<(() => void) | null>(null);

  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setCanScrollUp(scrollTop > 1);
      setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    // 内容子元素高度变化不会改变容器自身尺寸，新增或删除条目时依赖子元素触发更新
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    cleanupRef.current = () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const maskImage = useMemo(() => {
    const mid = Math.round(fadeSize * MID_RATIO);
    const topFade = `transparent, rgba(0,0,0,${MID_OPACITY}) ${mid}px, black ${fadeSize}px`;
    const bottomFade = `black calc(100% - ${fadeSize}px), rgba(0,0,0,${MID_OPACITY}) calc(100% - ${mid}px), transparent`;
    if (canScrollUp && canScrollDown) {
      return `linear-gradient(to bottom, ${topFade}, ${bottomFade})`;
    }
    if (canScrollDown) {
      return `linear-gradient(to bottom, ${bottomFade})`;
    }
    if (canScrollUp) {
      return `linear-gradient(to bottom, ${topFade})`;
    }
    return undefined;
  }, [canScrollUp, canScrollDown, fadeSize]);

  return { scrollRef, maskImage };
}
