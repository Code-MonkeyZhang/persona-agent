/**
 * @file 聊天区文件拖放捕获
 * 机制照 dsh：dragenter 与 dragleave 用计数器配对，dragover 里用 dropEffect 表达可否接收，
 * drop 与 window dragend 双路归零兜底，非文件拖拽直接放行浏览器原生行为
 * 挂载照 cindy：同一组处理器展开到多个容器元素共用一个计数器，这里挂消息 pane 与输入浮层两处
 * 另设 window 级守卫对文件拖拽静默 preventDefault，捕获面外松手不会被浏览器当作打开文件
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../lib/logger';

/** 拖拽进行中 dataTransfer 只暴露类型字符串，文件载荷统一以 Files 出现 */
function hasFilePayload(e: React.DragEvent | DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

interface UseChatDropOptions {
  /** 是否允许接收，false 时 dropEffect 为 none 且松手不派发，遮罩走禁止态 */
  canAccept: boolean;
  /** 允许接收时松手派发，文件来自 dataTransfer.files */
  onDropFiles: (files: File[]) => void;
}

/** 聊天区拖放接线，bind 展开到各捕获容器，dragOver 驱动遮罩 */
export function useChatDrop({ canAccept, onDropFiles }: UseChatDropOptions) {
  const depthRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    depthRef.current = 0;
    setDragOver(false);
  }, []);

  /** 拖拽被取消或落在捕获面之外时 dragend 兜底归零，防止遮罩卡住不消失 */
  useEffect(() => {
    window.addEventListener('dragend', reset);
    return () => window.removeEventListener('dragend', reset);
  }, [reset]);

  /** 捕获面之外松手默认会让浏览器打开文件导航走，window 级静默拦截兜住 */
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (hasFilePayload(e)) e.preventDefault();
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  /** 处理器每次渲染生成新对象，展开到多个容器共用同一个计数器 */
  const bind = useCallback(
    () => ({
      onDragEnter: (e: React.DragEvent) => {
        if (!hasFilePayload(e)) return;
        e.preventDefault();
        depthRef.current += 1;
        if (depthRef.current === 1) {
          logger.info('Chat drop enter', { canAccept });
          setDragOver(true);
        }
      },
      onDragOver: (e: React.DragEvent) => {
        if (!hasFilePayload(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = canAccept ? 'copy' : 'none';
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!hasFilePayload(e)) return;
        depthRef.current = Math.max(0, depthRef.current - 1);
        if (depthRef.current === 0) setDragOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (!hasFilePayload(e)) return;
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        reset();
        if (!canAccept) return;
        logger.info('Chat drop received', { count: files.length });
        onDropFiles(files);
      },
    }),
    [canAccept, onDropFiles, reset]
  );

  return { dragOver, bind };
}
