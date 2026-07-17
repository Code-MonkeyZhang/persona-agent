/**
 * @fileoverview HTTP routes for provider and auth management.
 *
 * Routes:
 * - GET  /api/providers         - List all providers with auth status
 * - GET  /api/auth/:id          - Get auth info
 * - PUT  /api/auth/:id          - Set auth info
 * - DELETE /api/auth/:id        - Delete auth info
 * - POST /api/auth/:id/verify   - Verify auth info
 */

import { Router } from 'express';
import {
  listProvidersWithAuth,
  getAuth,
  setAuth,
  deleteAuth,
} from '../../auth/index.js';
import type { KnownProvider, Provider, Auth } from '../../auth/index.js';
import { getModels, completeSimple } from '@earendil-works/pi-ai';
import { Logger } from '../../util/logger.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError, errorMessage } from '../../util/errors.js';

/**
 * Creates router for provider management.
 *
 * Routes:
 *   GET /api/providers - List all providers with their auth status
 */
export function createProviderRouter(): Router {
  const router = Router();

  /** GET /api/providers - List all providers with auth status */
  router.get(
    '/',
    asyncHandler('AUTH', 'Error listing providers', (_req, res) => {
      const providers = listProvidersWithAuth();
      res.json({ providers });
    })
  );

  return router;
}

/**
 * Creates router for auth management.
 *
 * Routes:
 *   GET    /api/auth/:provider        - Get auth info for a provider
 *   PUT    /api/auth/:provider        - Set auth info for a provider
 *   DELETE /api/auth/:provider        - Delete auth info for a provider
 *   POST   /api/auth/:provider/verify - Verify API key validity for a provider
 */
export function createAuthRouter(): Router {
  const router = Router();

  /** GET /api/auth/:provider - Get auth info from a provider */
  router.get(
    '/:provider',
    asyncHandler('AUTH', 'Error getting auth', (req, res) => {
      const provider = requireParam(
        getParam(req.params['provider']),
        'Provider'
      );

      const auth = getAuth(provider as Provider);
      if (!auth) throw new AppError(404, 'Auth not found for provider');

      res.json({
        provider,
        apiKey: auth.apiKey,
      });
    })
  );

  /** PUT /api/auth/:provider - Set auth info for a provider */
  router.put(
    '/:provider',
    asyncHandler('AUTH', 'Error setting auth', (req, res) => {
      const provider = requireParam(
        getParam(req.params['provider']),
        'Provider'
      );

      const input = req.body as Auth;
      if (!input.apiKey)
        throw new AppError(400, 'Missing required field: apiKey');

      const auth = setAuth(provider as Provider, input);
      Logger.log('AUTH', `Set auth for provider: ${provider}`);
      res.json({
        provider,
        apiKey: auth.apiKey,
      });
    })
  );

  /** DELETE /api/auth/:provider - Delete auth info from a provider*/
  router.delete(
    '/:provider',
    asyncHandler('AUTH', 'Error deleting auth', (req, res) => {
      const provider = requireParam(
        getParam(req.params['provider']),
        'Provider'
      );

      const existing = getAuth(provider as Provider);
      if (!existing) throw new AppError(404, 'Auth not found for provider');

      deleteAuth(provider as Provider);
      Logger.log('AUTH', `Deleted auth for provider: ${provider}`);
      res.json({ success: true });
    })
  );

  /**
   * POST /api/auth/:provider/verify - Verify auth info for a provider
   *
   * Input:
   *   Body: { apiKey?: string } - Optional. If omitted, uses stored key.
   */
  router.post(
    '/:provider/verify',
    asyncHandler('AUTH', 'Error verifying auth', async (req, res) => {
      const provider = requireParam(
        getParam(req.params['provider']),
        'Provider'
      );

      // use api key from req, if not use api key from storage
      const input = (req.body || {}) as { apiKey?: string };
      const apiKey = input.apiKey ?? getAuth(provider as Provider)?.apiKey;

      if (!apiKey) {
        res.json({
          valid: false,
          error: 'No API key provided or stored',
        });
        return;
      }

      const models = getModels(provider as KnownProvider);
      if (models.length === 0) {
        res.json({
          valid: false,
          error: 'No models found for provider',
        });
        return;
      }

      const testModel = models[0];
      if (!testModel) {
        res.json({
          valid: false,
          error: 'No test model available',
        });
        return;
      }

      // Send test request to verify API key
      let result;
      try {
        result = await completeSimple(
          testModel,
          {
            messages: [{ role: 'user', content: 'Hi', timestamp: Date.now() }],
          },
          { apiKey, maxTokens: 5 }
        );
      } catch (verifyError) {
        const msg = errorMessage(verifyError);
        Logger.log('AUTH', `Verification failed for ${provider}:`, msg);
        res.json({
          valid: false,
          error: msg,
        });
        return;
      }

      if (result.stopReason === 'error' || result.errorMessage) {
        Logger.log(
          'AUTH',
          `Verification failed for ${provider}:`,
          result.errorMessage
        );
        res.json({
          valid: false,
          error: result.errorMessage || 'API request failed',
        });
        return;
      }

      res.json({
        valid: true,
        models: models.map((m) => m.id),
      });
    })
  );

  return router;
}
