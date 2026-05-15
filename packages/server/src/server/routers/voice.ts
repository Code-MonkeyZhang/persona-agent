/**
 * @fileoverview HTTP routes for voice management (preset + cloned voices).
 *
 * Routes:
 * - GET    /api/voices          - Get all voices (cloned first, then preset)
 * - POST   /api/voices/clone    - Clone a new voice (upload + clone + verify)
 * - DELETE /api/voices/clone/:voiceId - Delete a cloned voice
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import {
  getAllVoices,
  addClonedVoice,
  removeClonedVoice,
} from '../../tts/voices.js';
import { getParam } from './utils.js';
import { Logger } from '../../util/logger.js';

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
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  },
});

export function createVoiceRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const voices = getAllVoices();
      res.json({ success: true, voices });
    } catch (error) {
      Logger.log('VOICE', 'Failed to get voices', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/voices/clone
   *
   * One-stop voice clone: accepts multipart audio + voice_id + name,
   * then upload → clone → verify → persist.
   */
  router.post(
    '/clone',
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          res
            .status(400)
            .json({ success: false, error: 'No audio file uploaded' });
          return;
        }

        const voiceId = req.body['voice_id'] as string | undefined;
        const name = req.body['name'] as string | undefined;

        if (!voiceId || !VOICE_ID_REGEX.test(voiceId)) {
          res.status(400).json({
            success: false,
            error:
              'voice_id must start with a letter, 8-256 chars (letters, digits, -, _)',
          });
          return;
        }

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          res.status(400).json({
            success: false,
            error: 'name is required',
          });
          return;
        }

        await addClonedVoice(
          req.file.buffer,
          req.file.originalname,
          voiceId,
          name.trim()
        );

        Logger.log('VOICE', `Cloned voice: ${voiceId}`);
        res.json({ success: true });
      } catch (error) {
        Logger.log('VOICE', 'Voice clone failed', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  router.delete('/clone/:voiceId', async (req: Request, res: Response) => {
    try {
      const voiceId = getParam(req.params['voiceId']);
      if (!voiceId) {
        res.status(400).json({ success: false, error: 'voiceId is required' });
        return;
      }

      await removeClonedVoice(voiceId);
      Logger.log('VOICE', `Deleted voice: ${voiceId}`);
      res.json({ success: true });
    } catch (error) {
      Logger.log('VOICE', 'Voice delete failed', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
