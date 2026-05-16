/**
 * @fileoverview HTTP routes for TTS configuration.
 *
 * Routes:
 * - GET  /api/tts/config  - Get current TTS config (apiKey, model, clonedVoices, summaryThreshold)
 * - PUT  /api/tts/config  - Update apiKey, model and/or summaryThreshold
 * - GET  /api/tts/models  - Get hardcoded list of 8 TTS models
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadTtsConfig, saveTtsConfig } from '../../tts/store.js';
import { TTS_MODELS } from '../../tts/types.js';
import { loadConfig, saveConfig } from '../../config/index.js';
import { getConfigPath } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';

export function createTtsRouter(): Router {
  const router = Router();

  router.get('/config', (_req: Request, res: Response) => {
    try {
      const ttsConfig = loadTtsConfig();
      const appConfig = loadConfig(getConfigPath());
      res.json({
        success: true,
        config: {
          ...ttsConfig,
          summaryThreshold: appConfig.tts?.summaryThreshold ?? 200,
        },
      });
    } catch (error) {
      Logger.log('TTS', 'Failed to load TTS config', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.put('/config', (req: Request, res: Response) => {
    try {
      const { apiKey, model, summaryThreshold } = req.body as {
        apiKey?: unknown;
        model?: unknown;
        summaryThreshold?: unknown;
      };

      const config = loadTtsConfig();

      if (apiKey !== undefined) {
        if (typeof apiKey !== 'string') {
          res.status(400).json({
            success: false,
            error: 'apiKey must be a string',
          });
          return;
        }
        config.apiKey = apiKey;
      }

      if (model !== undefined) {
        if (typeof model !== 'string') {
          res.status(400).json({
            success: false,
            error: 'model must be a string',
          });
          return;
        }
        config.model = model;
      }

      saveTtsConfig(config);

      if (summaryThreshold !== undefined) {
        if (typeof summaryThreshold !== 'number') {
          res.status(400).json({
            success: false,
            error: 'summaryThreshold must be a number',
          });
          return;
        }
        const configPath = getConfigPath();
        const appConfig = loadConfig(configPath);
        appConfig.tts = { summaryThreshold };
        saveConfig(configPath, appConfig);
      }

      res.json({ success: true });
    } catch (error) {
      Logger.log('TTS', 'Failed to save TTS config', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.get('/models', (_req: Request, res: Response) => {
    res.json({ success: true, models: TTS_MODELS });
  });

  return router;
}
