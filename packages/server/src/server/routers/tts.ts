/**
 * @fileoverview HTTP routes for TTS configuration.
 *
 * Routes:
 * - GET  /api/tts/config  - Get current TTS config (apiKey, model, clonedVoices, summaryThreshold)
 * - PUT  /api/tts/config  - Update apiKey, model and/or summaryThreshold
 * - GET  /api/tts/models  - Get hardcoded list of 8 TTS models
 */

import { Router } from 'express';
import { loadTtsConfig, saveTtsConfig } from '../../tts/store.js';
import { TTS_MODELS } from '../../tts/types.js';
import { asyncHandler } from './utils.js';
import { AppError } from '../../util/errors.js';

export function createTtsRouter(): Router {
  const router = Router();

  router.get(
    '/config',
    asyncHandler('TTS', 'Failed to load TTS config', (_req, res) => {
      const config = loadTtsConfig();
      res.json({ config });
    })
  );

  router.put(
    '/config',
    asyncHandler('TTS', 'Failed to save TTS config', (req, res) => {
      const { apiKey, model, summaryThreshold } = req.body as {
        apiKey?: unknown;
        model?: unknown;
        summaryThreshold?: unknown;
      };

      const config = loadTtsConfig();

      if (apiKey !== undefined) {
        if (typeof apiKey !== 'string') {
          throw new AppError(400, 'apiKey must be a string');
        }
        config.apiKey = apiKey;
      }

      if (model !== undefined) {
        if (typeof model !== 'string') {
          throw new AppError(400, 'model must be a string');
        }
        config.model = model;
      }

      if (summaryThreshold !== undefined) {
        if (typeof summaryThreshold !== 'number') {
          throw new AppError(400, 'summaryThreshold must be a number');
        }
        config.summaryThreshold = summaryThreshold;
      }

      saveTtsConfig(config);

      res.json({ success: true });
    })
  );

  router.get('/models', (_req, res) => {
    res.json({ models: TTS_MODELS });
  });

  return router;
}
