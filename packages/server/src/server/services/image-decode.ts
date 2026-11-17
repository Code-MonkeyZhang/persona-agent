/**
 * @fileoverview 上传图片的统一解码入口。
 *
 * jimp 原生覆盖产品口径内的 jpeg 与 png，解码失败统一按 400 拒绝并记日志，
 * 头像处理与壁纸校验共用同一套错误映射。
 */

import { Jimp } from 'jimp';
import { AppError } from '../../util/errors.js';
import { Logger } from '../../util/logger.js';

/**
 * 解码上传的图片 buffer 为 jimp 图像。
 *
 * @param buffer - 上传的原始图片字节
 * @param what - 日志与错误信息里的用途描述
 * @param category - Logger 日志分类标签
 * @returns 解码后的 jimp 图像实例
 */
export async function decodeImage(
  buffer: Buffer,
  what: string,
  category: string
): Promise<Awaited<ReturnType<typeof Jimp.read>>> {
  try {
    return await Jimp.read(buffer);
  } catch {
    Logger.log(category, `Rejected ${what}: decode failed`);
    throw new AppError(400, `Invalid ${what}: not a decodable image`);
  }
}
