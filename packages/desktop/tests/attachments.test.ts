/**
 * @fileoverview 附件工具与 useAttachments 的单元测试：
 * 块组装与解析、入口过滤、发送期压缩上传与失败重试
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { UIAttachment } from '@/types/chat';

const uploadMock = vi.fn();
const compressMock = vi.fn();

vi.mock('@/lib/api', () => ({
  uploadAttachment: (...args: unknown[]) => uploadMock(...args),
  getAttachmentUrl: (hash: string) => `persona-image://${hash}?src=x`,
}));

vi.mock('@/lib/attachments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/attachments')>();
  return {
    ...actual,
    // 压缩在真实浏览器走 canvas，单测里以透传桩替代并记录调用
    compressImageIfNeeded: (...args: unknown[]) => compressMock(...args),
    readDimensions: () => Promise.resolve({ width: 0, height: 0 }),
  };
});

import {
  toContentBlocks,
  fromContentBlocks,
} from '@/lib/attachments';
import { useAttachments } from '@/hooks/useAttachments';

/** 已上传态的附件样板 */
function uploadedAttachment(overrides: Partial<UIAttachment> = {}): UIAttachment {
  return {
    id: 'a1',
    kind: 'image',
    name: 'photo.png',
    bytes: 100,
    width: 10,
    height: 10,
    status: 'uploaded',
    hash: 'f'.repeat(64),
    mimeType: 'image/png',
    ...overrides,
  };
}

describe('toContentBlocks', () => {
  /** 测试无附件时保持纯字符串 */
  it('returns plain string when no attachments', () => {
    expect(toContentBlocks('你好', [])).toBe('你好');
  });

  /** 测试带附件时组装为块数组，空正文不产生文本块 */
  it('builds block array with text first', () => {
    const blocks = toContentBlocks('看图', [
      uploadedAttachment(),
      uploadedAttachment({ id: 'a2', kind: 'file', name: '报表.zip', bytes: 5 }),
    ]);
    expect(blocks).toEqual([
      { type: 'text', text: '看图' },
      {
        type: 'image',
        hash: 'f'.repeat(64),
        mimeType: 'image/png',
        width: 10,
        height: 10,
        bytes: 100,
      },
      { type: 'file', hash: 'f'.repeat(64), name: '报表.zip', bytes: 5 },
    ]);
  });

  /** 测试仅附件消息不产生空文本块 */
  it('omits text block for empty body', () => {
    const blocks = toContentBlocks('', [
      uploadedAttachment({ kind: 'file', name: 'a.zip' }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'file' });
  });
});

describe('fromContentBlocks', () => {
  /** 测试纯字符串原样返回 */
  it('passes string through', () => {
    expect(fromContentBlocks('hi')).toEqual({ text: 'hi', attachments: [] });
  });

  /** 测试块数组解析出正文与带协议地址的附件 */
  it('parses blocks into text and attachments', () => {
    const { text, attachments } = fromContentBlocks([
      { type: 'text', text: '看看' },
      {
        type: 'image',
        hash: 'a'.repeat(64),
        mimeType: 'image/png',
        width: 8,
        height: 6,
        bytes: 20,
      },
      { type: 'file', hash: 'b'.repeat(64), name: '报表.pdf', bytes: 300 },
    ]);
    expect(text).toBe('看看');
    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({
      kind: 'image',
      url: `persona-image://${'a'.repeat(64)}?src=x`,
      status: 'uploaded',
    });
    expect(attachments[1]).toMatchObject({
      kind: 'file',
      name: '报表.pdf',
    });
    expect(attachments[1]?.url).toBeUndefined();
  });
});

describe('useAttachments', () => {
  /** jsdom 不实现 objectURL 与图片种入的 IPC，桩掉 */
  beforeAll(() => {
    let seq = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${++seq}`);
    URL.revokeObjectURL = vi.fn();
    window.api = {
      imageSeed: vi.fn().mockResolvedValue(true),
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof window.api;
  });

  beforeEach(() => {
    uploadMock.mockReset();
    compressMock.mockReset();
  });

  /** 造一个指定类型与大小的文件，size 可脱离真实内容指定，jsdom 的 File 缺 arrayBuffer 一并补桩 */
  function makeFile(name: string, type: string, size = 10): File {
    const file = new File(['content'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    file.arrayBuffer = async () => new ArrayBuffer(size);
    return file;
  }

  /** 测试图片按声明 MIME 进图片分支带预览地址，其余进文件分支 */
  it('routes kinds by declared mime', async () => {
    compressMock.mockImplementation((file: File) =>
      Promise.resolve({
        blob: file,
        mimeType: file.type,
        width: 0,
        height: 0,
      })
    );
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      result.current.addFiles([
        makeFile('photo.png', 'image/png'),
        makeFile('报表.zip', 'application/zip'),
      ]);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]).toMatchObject({
      kind: 'image',
      url: 'blob:mock-1',
      status: 'ready',
    });
    expect(result.current.items[1]).toMatchObject({
      kind: 'file',
      url: undefined,
    });
  });

  /** 测试单件超限不收并回调提示 */
  it('filters oversize files with callback', async () => {
    const onOversize = vi.fn();
    const { result } = renderHook(() => useAttachments({ onOversize }));
    await act(async () => {
      result.current.addFiles([
        makeFile('big.bin', 'application/zip', 21 * 1024 * 1024),
      ]);
    });
    expect(result.current.items).toHaveLength(0);
    expect(onOversize).toHaveBeenCalledTimes(1);
  });

  /** 测试数量超限能塞多少塞多少 */
  it('fills remaining slots and notifies limit', async () => {
    const onLimitReached = vi.fn();
    const { result } = renderHook(() => useAttachments({ onLimitReached }));
    const files = Array.from({ length: 22 }, (_, i) =>
      makeFile(`f${i}.txt`, 'text/plain')
    );
    await act(async () => {
      result.current.addFiles(files);
    });
    expect(result.current.items).toHaveLength(20);
    expect(onLimitReached).toHaveBeenCalledTimes(1);
  });

  /** 测试发送期图片走压缩后上传，全部落定携带哈希 */
  it('compresses images then uploads with hash', async () => {
    compressMock.mockImplementation((file: File) =>
      Promise.resolve({
        blob: file,
        mimeType: file.type,
        width: 100,
        height: 50,
      })
    );
    uploadMock.mockResolvedValue({
      hash: 'c'.repeat(64),
      format: 'image/png',
      size: 10,
      name: 'photo.png',
    });
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      result.current.addFiles([makeFile('photo.png', 'image/png')]);
    });

    let settled: UIAttachment[] | null = null;
    await act(async () => {
      settled = await result.current.uploadAll();
    });

    expect(settled).not.toBeNull();
    expect(settled![0]).toMatchObject({
      status: 'uploaded',
      hash: 'c'.repeat(64),
      mimeType: 'image/png',
      width: 100,
      height: 50,
    });
    expect(compressMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(result.current.items[0]).toMatchObject({
      status: 'uploaded',
      hash: 'c'.repeat(64),
      mimeType: 'image/png',
      width: 100,
      height: 50,
    });
  });

  /** 测试文件分支不压缩直接上传 */
  it('uploads files without compression', async () => {
    uploadMock.mockResolvedValue({
      hash: 'd'.repeat(64),
      format: 'application/zip',
      size: 10,
      name: '报表.zip',
    });
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      result.current.addFiles([makeFile('报表.zip', 'application/zip')]);
    });

    let settled: UIAttachment[] | null = null;
    await act(async () => {
      settled = await result.current.uploadAll();
    });

    expect(settled).not.toBeNull();
    expect(settled![0]).toMatchObject({
      status: 'uploaded',
      hash: 'd'.repeat(64),
      mimeType: 'application/zip',
    });
    expect(compressMock).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({
      status: 'uploaded',
      hash: 'd'.repeat(64),
      mimeType: 'application/zip',
    });
  });

  /** 测试上传失败留红卡，重试只补失败项 */
  it('marks failure and recovers via retry', async () => {
    compressMock.mockImplementation((file: File) =>
      Promise.resolve({
        blob: file,
        mimeType: file.type,
        width: 0,
        height: 0,
      })
    );
    uploadMock.mockRejectedValueOnce(new Error('boom'));
    uploadMock.mockResolvedValue({
      hash: 'e'.repeat(64),
      format: 'image/png',
      size: 10,
      name: 'photo.png',
    });
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      result.current.addFiles([makeFile('photo.png', 'image/png')]);
    });

    let settled: UIAttachment[] | null = null;
    await act(async () => {
      settled = await result.current.uploadAll();
    });
    expect(settled).toBeNull();
    expect(result.current.items[0]).toMatchObject({ status: 'error' });
    expect(result.current.hasError).toBe(true);

    act(() => {
      result.current.retry(result.current.items[0]!.id);
    });
    await waitFor(() =>
      expect(result.current.items[0]).toMatchObject({
        status: 'uploaded',
        hash: 'e'.repeat(64),
      })
    );
  });

  /** 测试草稿删除回收地址 */
  it('revokes object url on remove', async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      result.current.addFiles([makeFile('photo.png', 'image/png')]);
    });
    const url = result.current.items[0]!.url;
    act(() => {
      result.current.remove(result.current.items[0]!.id);
    });
    expect(result.current.items).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
});
