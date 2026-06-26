/**
 * @fileoverview HTTP routes for configuration management.
 *
 * Routes:
 * - GET /api/config - Get current configuration
 * - PUT /api/config - Update configuration
 */

import { Router } from 'express';
import { loadConfig, saveConfig, type AppConfig } from '../../config/index.js';
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
   * After saving, immediately updates Logger's enabled state.
   */
  router.put(
    '/',
    asyncHandler('CONFIG', 'Failed to save configuration', (req, res) => {
      const { enableLogging } = req.body;

      if (typeof enableLogging !== 'boolean') {
        throw new AppError(400, 'enableLogging must be a boolean');
      }

      const config: AppConfig = { enableLogging };
      saveConfig(configPath, config);

      // Dynamically update Logger's enabled state
      Logger.setEnabled(enableLogging);

      res.json({ success: true, message: '配置已保存' });
    })
  );

  return router;
}
