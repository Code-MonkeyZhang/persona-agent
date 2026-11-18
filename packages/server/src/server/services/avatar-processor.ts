/**
 * @fileoverview Avatar image processing utility.
 *
 * Decodes via the shared image decode entry, then resizes uploaded avatar
 * images to a fixed 256x256 square, applying center-crop scaling via the
 * `cover` operation.
 */

import { decodeImage } from './image-decode.js';

/** Avatar images are normalized to this square size */
const AVATAR_SIZE = 256;

/**
 * Process an avatar image buffer into a standardized 256x256 PNG.
 *
 * Decoding goes through the shared decode entry, so an invalid buffer
 * fails as a 400 AppError instead of an opaque 500. Applies center-crop
 * scaling (equivalent to CSS `object-fit: cover`) to produce a square
 * output, and encodes the result as PNG.
 *
 * @param buffer - Raw image bytes in a supported format
 * @returns PNG-encoded Buffer of the 256x256 avatar
 */
export async function processAvatar(buffer: Buffer): Promise<Buffer> {
  const image = await decodeImage(buffer, 'avatar', 'AVATAR');
  image.cover({ w: AVATAR_SIZE, h: AVATAR_SIZE });
  return image.getBuffer('image/png');
}
