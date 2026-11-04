/**
 * @file 附件的常量、展示预设与发送前压缩
 * 图片与文件统一为附件模型，展示形态按扩展名映射图标与淡彩底色
 * 预设表手法参考 cherry-studio 的 fileTokenPresentation
 * 图片体积控制在发送动作里由浏览器 canvas 完成，服务端零图片处理
 */
import {
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Presentation,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ContentBlock } from '@persona/shared';
import type { UIAttachment } from '../types/chat';
import { getAttachmentUrl } from './api';

/** 图片附件的 MIME 白名单，命中按图片渲染，其余一律视为文件 */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/** 每条消息附件合计上限，图片与文件混算 */
export const MAX_ATTACHMENTS = 20;

/** 单个附件入口体积上限，超过不收并提示 */
export const MAX_ATTACH_BYTES = 20 * 1024 * 1024;

/** 压缩判定的长边像素上限 */
const COMPRESS_MAX_EDGE = 2048;

/** 压缩判定的编码后体积上限 */
const COMPRESS_MAX_BYTES = 4.5 * 1024 * 1024;

/** 压缩导出的长边阶梯，逐级缩小直到体积达标 */
const EDGE_LADDER = [2048, 1600, 1280];

/** jpeg 导出的质量阶梯，从 0.9 递降 */
const JPEG_QUALITY_LADDER = [0.9, 0.75, 0.6];

/** 展示预设：图标、图标槽底色、类型标签、覆盖的扩展名 */
export interface AttachmentPresentation {
  icon: LucideIcon;
  iconClassName: string;
  typeLabel: string;
  extensions: string[];
}

const PRESENTATIONS: AttachmentPresentation[] = [
  {
    icon: FileText,
    iconClassName: 'bg-red-100 text-red-700',
    typeLabel: 'PDF',
    extensions: ['pdf'],
  },
  {
    icon: FileType2,
    iconClassName: 'bg-blue-100 text-blue-700',
    typeLabel: 'WORD',
    extensions: ['doc', 'docx', 'rtf'],
  },
  {
    icon: FileSpreadsheet,
    iconClassName: 'bg-green-100 text-green-700',
    typeLabel: 'EXCEL',
    extensions: ['xls', 'xlsx', 'csv'],
  },
  {
    icon: Presentation,
    iconClassName: 'bg-orange-100 text-orange-700',
    typeLabel: 'PPT',
    extensions: ['ppt', 'pptx'],
  },
  {
    icon: FileCode2,
    iconClassName: 'bg-indigo-100 text-indigo-700',
    typeLabel: 'CODE',
    extensions: [
      'ts',
      'tsx',
      'js',
      'jsx',
      'py',
      'rs',
      'go',
      'java',
      'c',
      'cpp',
      'h',
      'cs',
      'rb',
      'sh',
      'json',
      'yaml',
      'yml',
      'toml',
      'xml',
      'html',
      'css',
      'sql',
    ],
  },
  {
    icon: FileText,
    iconClassName: 'bg-slate-100 text-slate-700',
    typeLabel: 'TEXT',
    extensions: ['md', 'txt', 'log', 'ini', 'cfg'],
  },
  {
    icon: FileArchive,
    iconClassName: 'bg-amber-100 text-amber-700',
    typeLabel: 'ARCHIVE',
    extensions: ['zip', 'tar', 'gz', '7z', 'rar'],
  },
  {
    icon: FileImage,
    iconClassName: 'bg-cyan-100 text-cyan-700',
    typeLabel: 'IMAGE',
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'],
  },
];

const FALLBACK_PRESENTATION: AttachmentPresentation = {
  icon: File,
  iconClassName: 'bg-muted text-muted-foreground',
  typeLabel: 'FILE',
  extensions: [],
};

const presetByExtension = new Map<string, AttachmentPresentation>();
for (const preset of PRESENTATIONS) {
  for (const ext of preset.extensions) {
    presetByExtension.set(ext, preset);
  }
}

/** 按文件名取展示预设，扩展名未命中时回退通用文件档 */
export function getAttachmentPresentation(
  fileName: string
): AttachmentPresentation {
  const ext = fileName.includes('.')
    ? fileName.split('.').pop()!.toLowerCase()
    : '';
  return presetByExtension.get(ext) ?? FALLBACK_PRESENTATION;
}

/** 文件扩展名大写，用于元信息行，无扩展名时回退 FILE */
export function fileExtOf(fileName: string): string {
  const ext = fileName.includes('.')
    ? fileName.split('.').pop()!.toLowerCase()
    : '';
  return (ext || 'file').toUpperCase();
}

/** 人类可读的附件体积，数值小于 10 保留一位小数否则取整 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${Math.max(bytes, 0)}B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const text = size < 10 ? size.toFixed(1) : String(Math.round(size));
  return `${text}${units[unit]}`;
}

/** 发送前压缩的产物，mimeType 已按导出格式修正 */
export interface CompressedImage {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

/** 读取本地图片宽高，失败时回退 0，排版不依赖它成功 */
export function readDimensions(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

/** 经 objectURL 解码图片，超限 gif 在这里天然只取首帧 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = url;
  });
}

/** canvas 导出 Blob，png 不带质量参数 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('export failed'))),
      type,
      quality
    );
  });
}

/** 生成 PhotoSwipe Item 的 original、thumbnail 与宽高提示，草稿缩略图与气泡图片共用
 *  宽高未知时按 1024 兜底，保证打开预览的缩放动画有基准 */
export function previewItemProps(image: UIAttachment): {
  original: string;
  thumbnail: string;
  width: number;
  height: number;
} {
  return {
    original: image.url ?? '',
    thumbnail: image.url ?? '',
    width: image.width || 1024,
    height: image.height || 1024,
  };
}

/** 图片 MIME 到扩展名的映射，历史块图片的展示名由此派生 */
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * 把消息内容解析回正文与附件视图模型。
 * 图片块经协议地址指向附件仓，缓存命中零网络回流；文件块不带地址，下载时按哈希取。
 *
 * @param content - 纯字符串或内容块数组
 * @returns 正文文本与附件列表，无附件时列表为空
 */
export function fromContentBlocks(content: string | ContentBlock[]): {
  text: string;
  attachments: UIAttachment[];
} {
  if (typeof content === 'string') return { text: content, attachments: [] };
  let text = '';
  const attachments: UIAttachment[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'image') {
      const ext = IMAGE_EXT_BY_MIME[block.mimeType] ?? 'png';
      attachments.push({
        id: `blk-${block.hash}-${attachments.length}`,
        kind: 'image',
        url: getAttachmentUrl(block.hash),
        name: `image.${ext}`,
        bytes: block.bytes,
        width: block.width,
        height: block.height,
        status: 'uploaded',
        hash: block.hash,
        mimeType: block.mimeType,
      });
    } else {
      attachments.push({
        id: `blk-${block.hash}-${attachments.length}`,
        kind: 'file',
        name: block.name,
        bytes: block.bytes,
        status: 'uploaded',
        hash: block.hash,
      });
    }
  }
  return { text, attachments };
}

/**
 * 发送前的图片压缩判定。
 *
 * - 长边不超过 2048 像素且体积不超过 4.5MB 的原样返回，一个字节不动，GIF 动画因此保留
 * - 超限图按长边阶梯等比缩小经 canvas 重新导出，jpeg 与 webp 导出 jpeg 按质量递降，
 *   png 与 gif 导出 png 保透明，超限 gif 压缩后动画退化为首帧
 * - 阶梯用尽仍超限时返回最小一档产物，是否放行交由二十兆入口上限
 *
 * @param file - 原始图片文件
 * @param width - 草稿期读取的宽
 * @param height - 草稿期读取的高
 * @returns 压缩产物，mimeType 与实际字节一致
 */
export async function compressImageIfNeeded(
  file: File,
  width: number,
  height: number
): Promise<CompressedImage> {
  const longEdge = Math.max(width, height);
  if (longEdge <= COMPRESS_MAX_EDGE && file.size <= COMPRESS_MAX_BYTES) {
    return { blob: file, mimeType: file.type, width, height };
  }

  const exportType =
    file.type === 'image/png' || file.type === 'image/gif'
      ? 'image/png'
      : 'image/jpeg';
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const sourceEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const qualities =
      exportType === 'image/jpeg' ? JPEG_QUALITY_LADDER : [undefined];
    let last: CompressedImage | null = null;

    for (const edge of EDGE_LADDER) {
      const scale = Math.min(1, edge / sourceEdge);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, exportType, quality);
        last = { blob, mimeType: exportType, width: w, height: h };
        if (blob.size <= COMPRESS_MAX_BYTES) {
          return last;
        }
      }
    }
    return last!;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 把发送正文与已上传的附件组装为消息内容。
 * 附件为空返回纯字符串，否则返回块数组，宽高取草稿期读取的值。
 *
 * @param text - 已去空白的正文，可为空串
 * @param attachments - 全部已达 uploaded 态的附件
 * @returns 纯字符串或内容块数组
 */
export function toContentBlocks(
  text: string,
  attachments: UIAttachment[]
): string | ContentBlock[] {
  if (attachments.length === 0) return text;
  const blocks: ContentBlock[] = [];
  if (text.length > 0) blocks.push({ type: 'text', text });
  for (const attachment of attachments) {
    if (attachment.kind === 'image') {
      blocks.push({
        type: 'image',
        hash: attachment.hash!,
        mimeType: attachment.mimeType!,
        width: attachment.width ?? 0,
        height: attachment.height ?? 0,
        bytes: attachment.bytes,
      });
    } else {
      blocks.push({
        type: 'file',
        hash: attachment.hash!,
        name: attachment.name,
        bytes: attachment.bytes,
      });
    }
  }
  return blocks;
}
