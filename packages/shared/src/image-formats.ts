/**
 * @fileoverview 产品口径的图片格式统一清单。
 *
 * mime 与扩展名配对维护，派生出前端 accept 与服务端白名单，
 * 消费方不再各自硬编码名单。gif 与 webp 不在支持范围。
 */

/** mime 与扩展名的配对条目 */
const FORMATS = [
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  { mime: 'image/png', extensions: ['.png'] },
] as const;

/** 支持上传与读取的图片 MIME 类型 */
export const SUPPORTED_IMAGE_MIME_TYPES: readonly string[] = FORMATS.map(
  (format) => format.mime
);

/** 支持上传与读取的图片扩展名，全部小写 */
export const SUPPORTED_IMAGE_EXTENSIONS: readonly string[] = FORMATS.flatMap(
  (format) => [...format.extensions]
);

/** 文件选择器 accept 属性的现成值 */
export const IMAGE_INPUT_ACCEPT: string = SUPPORTED_IMAGE_MIME_TYPES.join(',');
