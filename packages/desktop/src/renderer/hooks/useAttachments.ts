/**
 * @file 输入框附件状态
 * 管理草稿区图片与文件的选择、删除、上限与发送期压缩上传
 * 草稿期纯本地零上传，objectURL 做预览，图片与文件按声明的 MIME 分流不做字节校验
 * 压缩与上传都发生在发送动作里，失败单项可重试，重试只重传失败项
 * 发送时地址所有权移交给消息，clear 不回收，仅从草稿删除时 revokeObjectURL
 */
import { useCallback, useRef, useState } from 'react';
import type { UIAttachment } from '../types/chat';
import {
  IMAGE_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACH_BYTES,
  compressImageIfNeeded,
  readDimensions,
} from '../lib/attachments';
import { uploadAttachment } from '../lib/api';
import { logger } from '../lib/logger';

interface UseAttachmentsOptions {
  /** 超出合计上限时回调，用于提示 */
  onLimitReached?: () => void;
  /** 单件超出体积上限时回调，用于提示 */
  onOversize?: () => void;
}

/** 单项压缩后上传落定，返回是否成功 */
async function settleUpload(
  item: UIAttachment,
  file: File
): Promise<Partial<UIAttachment> | null> {
  try {
    let blob: Blob = file;
    let width = item.width;
    let height = item.height;
    if (item.kind === 'image') {
      const compressed = await compressImageIfNeeded(
        file,
        item.width ?? 0,
        item.height ?? 0
      );
      if (compressed.blob !== file) {
        logger.info('Attachment compressed before upload', {
          name: item.name,
          before: file.size,
          after: compressed.blob.size,
          mimeType: compressed.mimeType,
        });
      }
      blob = compressed.blob;
      width = compressed.width;
      height = compressed.height;
    }
    const uploaded = await uploadAttachment(
      blob,
      item.kind === 'image' ? item.name : file.name
    );
    logger.info('Attachment uploaded', {
      name: item.name,
      hash: uploaded.hash,
      format: uploaded.format,
      size: uploaded.size,
    });
    return {
      status: 'uploaded',
      hash: uploaded.hash,
      mimeType: uploaded.format,
      bytes: uploaded.size,
      width,
      height,
    };
  } catch (error) {
    logger.warn('Attachment upload failed', {
      name: item.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function useAttachments({
  onLimitReached,
  onOversize,
}: UseAttachmentsOptions = {}) {
  const [items, setItems] = useState<UIAttachment[]>([]);
  /** 原始 File 的挂靠表，压缩与上传在发送期才需要它 */
  const filesRef = useRef(new Map<string, File>());

  /** 更新单项的局部字段 */
  const patchItem = useCallback((id: string, patch: Partial<UIAttachment>) => {
    setItems((prev) =>
      prev.map((im) => (im.id === id ? { ...im, ...patch } : im))
    );
  }, []);

  /** 三条入口共用的添加函数，体积与数量当场过滤，能塞多少塞多少 */
  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      const sized = incoming.filter((f) => f.size <= MAX_ATTACH_BYTES);
      if (sized.length < incoming.length) onOversize?.();

      const room = Math.max(0, MAX_ATTACHMENTS - items.length);
      const taken = sized.slice(0, room);
      if (sized.length > room) onLimitReached?.();
      logger.info('Attachments accepted', {
        picked: incoming.length,
        taken: taken.length,
      });
      if (taken.length === 0) return;

      const added: UIAttachment[] = taken.map((file) => {
        const isImage = IMAGE_MIME_TYPES.includes(file.type);
        return {
          id: crypto.randomUUID(),
          kind: isImage ? 'image' : 'file',
          url: isImage ? URL.createObjectURL(file) : undefined,
          name: file.name,
          bytes: file.size,
          width: isImage ? 0 : undefined,
          height: isImage ? 0 : undefined,
          status: 'ready',
        };
      });
      taken.forEach((file, index) =>
        filesRef.current.set(added[index]!.id, file)
      );
      setItems((prev) => [...prev, ...added]);

      added.forEach((item) => {
        if (item.kind === 'image' && item.url) {
          readDimensions(item.url).then((dims) => {
            if (dims.width > 0) patchItem(item.id, dims);
          });
        }
      });
    },
    [items.length, onLimitReached, onOversize, patchItem]
  );

  /** 从草稿删除：objectURL 立即回收 */
  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((im) => im.id === id);
      if (target?.url?.startsWith('blob:')) URL.revokeObjectURL(target.url);
      return prev.filter((im) => im.id !== id);
    });
    filesRef.current.delete(id);
  }, []);

  /** 发送期先压缩再统一起传，返回落定后的附件数组，任一失败返回 null 且失败项标 error。
   *  落定结果作为值交还调用方，避免发送流程在上传后回头读渲染快照 */
  const uploadAll = useCallback(async (): Promise<UIAttachment[] | null> => {
    const pending = items.filter(
      (im) => im.status === 'ready' || im.status === 'error'
    );
    if (pending.length === 0) return items;
    setItems((prev) =>
      prev.map((im) =>
        im.status === 'ready' || im.status === 'error'
          ? { ...im, status: 'uploading' }
          : im
      )
    );
    logger.info('Attachment upload batch start', { count: pending.length });
    const patches = await Promise.all(
      pending.map(async (item) => {
        const file = filesRef.current.get(item.id);
        return file ? settleUpload(item, file) : null;
      })
    );
    const patchById = new Map(
      pending.map((item, index) => [item.id, patches[index] ?? null] as const)
    );
    /** 把落定结果套到一份附件清单上，未参与上传的项原样保留，失败项标 error */
    const applyPatches = (list: UIAttachment[]): UIAttachment[] =>
      list.map((im) => {
        const patch = patchById.get(im.id);
        if (patch === undefined) return im;
        return patch ? { ...im, ...patch } : { ...im, status: 'error' };
      });
    setItems(applyPatches);
    const ok = patches.every(Boolean);
    logger.info('Attachment upload batch settled', {
      ok: patches.filter(Boolean).length,
      failed: patches.filter((p) => !p).length,
    });
    return ok ? applyPatches(items) : null;
  }, [items]);

  /** 发送期失败单项重试，仅 error 态可重试 */
  const retry = useCallback(
    (id: string) => {
      const target = items.find((im) => im.id === id);
      const file = target && filesRef.current.get(id);
      if (!target || target.status !== 'error' || !file) return;
      logger.info('Attachment retry', { id, name: target.name });
      patchItem(id, { status: 'uploading' });
      void settleUpload(target, file).then((patch) =>
        patchItem(id, patch ?? { status: 'error' })
      );
    },
    [items, patchItem]
  );

  /** 发送成功后清空草稿：地址已随消息移交，不做回收 */
  const clear = useCallback(() => {
    filesRef.current.clear();
    setItems([]);
  }, []);

  const isUploading = items.some((im) => im.status === 'uploading');
  const hasError = items.some((im) => im.status === 'error');

  return {
    items,
    addFiles,
    remove,
    clear,
    uploadAll,
    retry,
    isUploading,
    hasError,
  };
}
