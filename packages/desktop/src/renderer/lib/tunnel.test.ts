import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startTunnel, stopTunnel, getTunnelStatus } from './api';

/**
 * Stub window.api so getBaseUrl() resolves to a known URL.
 */
const TEST_BASE_URL = 'http://localhost:9999';

function setupWindowApi() {
  Object.defineProperty(globalThis, 'window', {
    value: {
      api: {
        getServerUrl: vi.fn().mockResolvedValue(TEST_BASE_URL),
      },
    },
    writable: true,
  });
}

describe('API Tunnel Functions', () => {
  beforeEach(() => {
    setupWindowApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startTunnel', () => {
    it('calls POST /api/tunnel/start', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'starting' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await startTunnel();
      expect(result.status).toBe('starting');
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/api/tunnel/start`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        })
      );

      await expect(startTunnel()).rejects.toThrow(
        'Failed to start tunnel: 500'
      );
    });
  });

  describe('stopTunnel', () => {
    it('calls POST /api/tunnel/stop', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })
      );

      const result = await stopTunnel();
      expect(result.success).toBe(true);
    });
  });

  describe('getTunnelStatus', () => {
    it('calls GET /api/tunnel/status and returns running', async () => {
      const mockResponse = {
        status: 'running',
        url: 'https://abc.trycloudflare.com',
        error: null,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await getTunnelStatus();
      expect(result.status).toBe('running');
      expect(result.url).toBe('https://abc.trycloudflare.com');
    });

    it('returns error status from server', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'error',
              url: null,
              error: 'Binary not found',
            }),
        })
      );

      const result = await getTunnelStatus();
      expect(result.status).toBe('error');
      expect(result.error).toBe('Binary not found');
    });

    it('throws on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
        })
      );

      await expect(getTunnelStatus()).rejects.toThrow(
        'Failed to get tunnel status: 400'
      );
    });
  });
});
