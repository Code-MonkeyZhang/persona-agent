/**
 * @file src/renderer/components/ui/ImageAddTile.tsx
 * @description 虚线加号磁贴，点击触发图片选择并读成 dataURL 上抛
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { useImageFileInput } from '../../hooks/useImageFileInput';

interface ImageAddTileProps {
  width: number;
  height: number;
  onPick: (file: File, dataUrl: string) => void;
}

/**
 * 图片添加磁贴：虚线边框 + 加号，尺寸由 width/height 指定。
 * 内部持有隐藏的文件 input，选择后由 hook 读取并上抛。
 * @param width - 磁贴宽度
 * @param height - 磁贴高度
 * @param onPick - 拿到原始文件与其 dataURL 的回调
 */
export const ImageAddTile: React.FC<ImageAddTileProps> = ({
  width,
  height,
  onPick,
}) => {
  const { inputRef, handleChange } = useImageFileInput(onPick);

  return (
    <>
      <div
        className="shrink-0 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center cursor-pointer hover:border-muted-foreground transition-colors"
        style={{ width, height }}
        onClick={() => inputRef.current?.click()}
      >
        <Plus className="w-5 h-5 text-muted-foreground" />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
};
