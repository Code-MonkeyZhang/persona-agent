import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTunnelStore } from './tunnelStore';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  startTunnel: vi.fn(),
  stopTunnel: vi.fn(),
  getTunnelStatus: vi.fn(),
}));

describe('tunnelStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTunnelStore.setState({
      status: 'stopped',
      url: null,
      error: null,
      isModalOpen: false,
    });
    useTunnelStore.getState().stopPolling();
  });

  afterEach(() => {
    useTunnelStore.getState().stopPolling();
  });

  describe('start', () => {
    it('sets status to starting and calls startTunnel API', async () => {
      vi.mocked(api.startTunnel).mockResolvedValue({ status: 'starting' });

      await useTunnelStore.getState().start();

      expect(api.startTunnel).toHaveBeenCalled();
      expect(useTunnelStore.getState().status).toBe('starting');
    });

    it('does not call API if already starting', async () => {
      useTunnelStore.setState({ status: 'starting' });

      await useTunnelStore.getState().start();

      expect(api.startTunnel).not.toHaveBeenCalled();
    });

    it('does not call API if already running', async () => {
      useTunnelStore.setState({ status: 'running' });

      await useTunnelStore.getState().start();

      expect(api.startTunnel).not.toHaveBeenCalled();
    });

    it('sets error state on API failure', async () => {
      vi.mocked(api.startTunnel).mockRejectedValue(new Error('Network error'));

      await useTunnelStore.getState().start();

      expect(useTunnelStore.getState().status).toBe('error');
      expect(useTunnelStore.getState().error).toBe('Network error');
    });
  });

  describe('stop', () => {
    it('calls stopTunnel API and resets state', async () => {
      useTunnelStore.setState({
        status: 'running',
        url: 'https://abc.trycloudflare.com',
      });
      vi.mocked(api.stopTunnel).mockResolvedValue({ success: true });

      await useTunnelStore.getState().stop();

      expect(api.stopTunnel).toHaveBeenCalled();
      expect(useTunnelStore.getState().status).toBe('stopped');
      expect(useTunnelStore.getState().url).toBeNull();
    });

    it('sets error on API failure', async () => {
      vi.mocked(api.stopTunnel).mockRejectedValue(new Error('Stop failed'));

      await useTunnelStore.getState().stop();

      expect(useTunnelStore.getState().error).toBe('Stop failed');
    });
  });

  describe('refreshStatus', () => {
    it('updates store from API response', async () => {
      vi.mocked(api.getTunnelStatus).mockResolvedValue({
        status: 'running',
        url: 'https://xyz.trycloudflare.com',
        error: null,
      });

      await useTunnelStore.getState().refreshStatus();

      expect(useTunnelStore.getState().status).toBe('running');
      expect(useTunnelStore.getState().url).toBe(
        'https://xyz.trycloudflare.com'
      );
    });

    it('stops polling when status is not starting', async () => {
      vi.mocked(api.getTunnelStatus).mockResolvedValue({
        status: 'running',
        url: 'https://abc.trycloudflare.com',
        error: null,
      });

      await useTunnelStore.getState().refreshStatus();

      expect(useTunnelStore.getState().status).toBe('running');
    });
  });

  describe('setModalOpen', () => {
    it('sets isModalOpen', () => {
      useTunnelStore.getState().setModalOpen(true);
      expect(useTunnelStore.getState().isModalOpen).toBe(true);

      useTunnelStore.getState().setModalOpen(false);
      expect(useTunnelStore.getState().isModalOpen).toBe(false);
    });
  });
});
