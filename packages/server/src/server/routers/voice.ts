/**
 * @fileoverview HTTP routes for voice management (preset + cloned voices).
 *
 * Routes:
 * - GET    /api/voices          - Get all voices (cloned first, then preset)
 * - POST   /api/voices/clone    - Clone a new voice (upload + clone + verify)
 * - DELETE /api/voices/clone/:voiceId - Delete a cloned voice
 */

import { Router } from 'express';
import multer from 'multer';
import {
  getAllVoices,
  addClonedVoice,
  removeClonedVoice,
} from '../../tts/voices.js';
import { asyncHandler, getParam } from './utils.js';
import { Logger } from '../../util/logger.js';
import { AppError } from '../../util/errors.js';

const VOICE_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{7,255}$/;

const ALLOWED_AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
]);

const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported audio format: ${file.mimetype}`));
    }
  },
});

export function createVoiceRouter(): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler('VOICE', 'Failed to get voices', (_req, res) => {
      const voices = getAllVoices();
      res.json({ voices });
    })
  );

  /**
   * POST /api/voices/clone
   *
   * One-stop voice clone: accepts multipart audio + voice_id + name,
   * then upload → clone → verify → persist.
   */
  router.post(
    '/clone',
    upload.single('file'),
    asyncHandler('VOICE', 'Voice clone failed', async (req, res) => {
      if (!req.file) {
        throw new AppError(400, 'No audio file uploaded');
      }

      const voiceId = req.body['voice_id'] as string | undefined;
      const name = req.body['name'] as string | undefined;

      if (!voiceId || !VOICE_ID_REGEX.test(voiceId)) {
        throw new AppError(
          400,
          'voice_id must start with a letter, 8-256 chars (letters, digits, -, _)'
        );
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new AppError(400, 'name is required');
      }

      await addClonedVoice(
        req.file.buffer,
        req.file.originalname,
        voiceId,
        name.trim()
      );

      Logger.log('VOICE', `Cloned voice: ${voiceId}`);
      res.json({ success: true });
    })
  );

  router.delete(
    '/clone/:voiceId',
    asyncHandler('VOICE', 'Voice delete failed', async (req, res) => {
      const voiceId = getParam(req.params['voiceId']);
      if (!voiceId) throw new AppError(400, 'voiceId is required');

      await removeClonedVoice(voiceId);
      Logger.log('VOICE', `Deleted voice: ${voiceId}`);
      res.json({ success: true });
    })
  );

  return router;
}
