/**
 * @fileoverview Avatar image processing utility.
 *
 * Uses jimp to resize uploaded avatar images to a fixed 256x256 square,
 * applying center-crop scaling via the `cover` operation.
 */

import { Jimp } from 'jimp';

/** Avatar images are normalized to this square size */
const AVATAR_SIZE = 256;

/**
 * Process an avatar image buffer into a standardized 256x256 PNG.
 *
 * Reads the image from a raw buffer, applies center-crop scaling
 * (equivalent to CSS `object-fit: cover`) to produce a square output,
 * and encodes the result as PNG.
 *
 * @param buffer - Raw image bytes (any format jimp supports)
 * @returns PNG-encoded Buffer of the 256x256 avatar
 */
export async function processAvatar(buffer: Buffer): Promise<Buffer> {
  const image = await Jimp.read(buffer);
  image.cover({ w: AVATAR_SIZE, h: AVATAR_SIZE });
  return image.getBuffer('image/png');
}
