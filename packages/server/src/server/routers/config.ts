/**
 * @fileoverview HTTP routes for configuration management.
 *
 * Routes:
 * - GET /api/config - Get current configuration
 * - PUT /api/config - Update configuration
 */

import { Router } from 'express';
import {
  loadConfig,
  saveConfig,
  setToolNarration,
  type AppConfig,
} from '../../config.js';
import { getConfigPath } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';
import { asyncHandler } from './utils.js';
import { AppError } from '../../util/errors.js';

export function createConfigRouter(): Router {
  const router = Router();
  const configPath = getConfigPath();

  /**
   * GET /api/config
   * Retrieves the current configuration from config.yaml
   */
  router.get(
    '/',
    asyncHandler('CONFIG', 'Failed to load configuration', (_req, res) => {
      const config = loadConfig(configPath);
      res.json({ config });
    })
  );

  /**
   * PUT /api/config
   * Updates the configuration and saves to config.yaml.
   * After saving, immediately updates Logger's enabled state and the narration switch.
   */
  router.put(
    '/',
    asyncHandler('CONFIG', 'Failed to save configuration', (req, res) => {
      const { enableLogging, enableToolNarration } = req.body;

      if (typeof enableLogging !== 'boolean') {
        throw new AppError(400, 'enableLogging must be a boolean');
      }
      if (
        enableToolNarration !== undefined &&
        typeof enableToolNarration !== 'boolean'
      ) {
        throw new AppError(400, 'enableToolNarration must be a boolean');
      }

      // 叙述开关缺省时保留文件现值，避免旧端 PUT 把它冲掉
      const config: AppConfig = {
        enableLogging,
        enableToolNarration:
          enableToolNarration ?? loadConfig(configPath).enableToolNarration,
      };
      saveConfig(configPath, config);

      // Dynamically update Logger's enabled state
      Logger.setEnabled(enableLogging);
      setToolNarration(config.enableToolNarration);

      res.json({ success: true, message: '配置已保存' });
    })
  );

  return router;
}
