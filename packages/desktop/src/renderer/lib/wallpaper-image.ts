/**
 * @file lib/wallpaper-image.ts
 * @description 壁纸上传管线。
 * 选图后转成 JPEG Blob，主图最大宽 1080 且短边不低于 720，
 * 缩略图长边 480，两者交给服务端按内容哈希落盘。
 */

/** 主图最大宽度 */
const MAX_WIDTH = 1080;

/** 服务端要求的主图短边下限 */
const MIN_SHORT_SIDE = 720;

/** 缩略图长边上限 */
const THUMB_LONG_SIDE = 480;

/** JPEG 有损压缩质量 */
const JPEG_QUALITY = 0.85;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

/** canvas 转 JPEG Blob，编码失败拒绝 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality
    );
  });
}

/** 按缩放比把原图绘制到新 canvas */
function drawScaled(img: HTMLImageElement, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 上传管线产出的两个 JPEG Blob */
export interface WallpaperImagePair {
  image: Blob;
  thumb: Blob;
}

/**
 * 完整上传管线：读文件、解码、产出主图与缩略图。
 * 主图先按最大宽 1080 缩放，缩后短边不足 720 且原图达标时改按短边 720 缩放，
 * 原图短边本身不足 720 时不放大，交服务端校验给出明确报错。
 */
export async function processWallpaperFile(
  file: File
): Promise<WallpaperImagePair> {
  const raw = await readAsDataUrl(file);
  const img = await loadImage(raw);

  const shortSide = Math.min(img.width, img.height);
  let scale = Math.min(1, MAX_WIDTH / img.width);
  if (shortSide * scale < MIN_SHORT_SIDE && shortSide >= MIN_SHORT_SIDE) {
    scale = MIN_SHORT_SIDE / shortSide;
  }
  const thumbScale = Math.min(
    1,
    THUMB_LONG_SIDE / Math.max(img.width, img.height)
  );

  const [image, thumb] = await Promise.all([
    canvasToBlob(drawScaled(img, scale), JPEG_QUALITY),
    canvasToBlob(drawScaled(img, thumbScale), JPEG_QUALITY),
  ]);
  return { image, thumb };
}
