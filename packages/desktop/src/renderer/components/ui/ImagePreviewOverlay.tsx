/**
 * @file src/renderer/components/ui/ImagePreviewOverlay.tsx
 * @description 图片放大预览遮罩，点击任意位置或按 Escape 键关闭
 */

import React, { useEffect } from 'react';

interface ImagePreviewOverlayProps {
  src: string;
  onClose: () => void;
}

/**
 * 图片放大预览遮罩，点击任意位置或按 Escape 键关闭。
 */
export const ImagePreviewOverlay: React.FC<ImagePreviewOverlayProps> = ({
  src,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={src}
        alt=""
        className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
      />
    </div>
  );
};
