/**
 * @file src/renderer/components/agent-editor/PoseImageCardList.tsx
 * @description 立绘图片卡片列表，支持添加、删除、重命名和放大预览
 */

import React, { useState } from 'react';
import { PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPoseImageUrl } from '../../lib/api';
import { ImageAddTile } from '../ui/ImageAddTile';
import { HoverDeleteButton } from '../ui/HoverDeleteButton';
import { ImagePreviewOverlay } from '../ui/ImagePreviewOverlay';
import { useInlineRename } from '../../hooks/useInlineRename';

/** 立绘图片的本地状态，用于追踪编辑过程中的增删改变更 */
export interface PoseImage {
  name: string;
  originalName?: string;
  file?: File;
  previewUrl?: string;
  status: 'existing' | 'added' | 'deleted';
}

interface PoseImageCardListProps {
  images: PoseImage[];
  onAdd: (file: File, dataUrl: string, name: string) => void;
  onRemove: (index: number) => void;
  onRename: (index: number, newName: string) => void;
  agentId: string | null;
}

/**
 * 立绘卡片列表：自持重命名与放大预览状态，
 * 增删改通过回调上抛，文件读取在本组件内完成后上抛。
 */
export const PoseImageCardList: React.FC<PoseImageCardListProps> = ({
  images,
  onAdd,
  onRemove,
  onRename,
  agentId,
}) => {
  const { t } = useTranslation();
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const {
    editingKey: renamingIdx,
    draft: renameInput,
    setDraft: setRenameInput,
    inputRef: renameInputRef,
    start: startRename,
    confirm: confirmRename,
    cancel: cancelRename,
  } = useInlineRename<number>((idx, newName) => onRename(idx, newName));

  /** 进入第 idx 张立绘的重命名，默认立绘不可改名 */
  const handleStartRename = (idx: number) => {
    if (images[idx].name === 'default') return;
    startRename(idx, images[idx].name);
  };

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1">
      {images.map((img, idx) => (
        <div
          key={img.name + img.status}
          className="relative group shrink-0 rounded-lg overflow-hidden bg-muted"
          style={{ width: 90, height: 120 }}
        >
          <img
            src={
              img.previewUrl ||
              (agentId ? getPoseImageUrl(agentId, img.name) : '')
            }
            alt=""
            className="w-full h-full object-contain cursor-pointer"
            onClick={() =>
              setPreviewSrc(
                img.previewUrl ||
                  (agentId ? getPoseImageUrl(agentId, img.name) : '')
              )
            }
          />
          <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            {renamingIdx === idx ? (
              <input
                ref={renameInputRef}
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
                onBlur={confirmRename}
                className="text-[10px] text-white bg-background/20 rounded px-1 py-0.5 leading-tight w-full outline-none border border-white/30"
              />
            ) : (
              <div className="flex items-center gap-1">
                <div
                  className="text-[10px] text-white/90 truncate leading-tight flex-1"
                  onDoubleClick={() => handleStartRename(idx)}
                >
                  {img.name}
                </div>
                {img.name === 'default' ? (
                  <span className="shrink-0 text-[8px] bg-background/25 text-white/90 rounded px-1 leading-tight">
                    {t('agentEditor.defaultPose')}
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(idx);
                    }}
                    className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-background/20 text-white/60 hover:text-white/90"
                  >
                    <PenLine className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>
          <HoverDeleteButton
            variant="dark"
            className="absolute top-1 right-1"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(idx);
            }}
          />
        </div>
      ))}
      <ImageAddTile
        width={90}
        height={120}
        onPick={(file, dataUrl) =>
          onAdd(
            file,
            dataUrl,
            file.name.replace(/\.[^.]+$/, '') || `pose_${images.length + 1}`
          )
        }
      />
      {previewSrc && (
        <ImagePreviewOverlay
          src={previewSrc}
          onClose={() => setPreviewSrc(null)}
        />
      )}
    </div>
  );
};
