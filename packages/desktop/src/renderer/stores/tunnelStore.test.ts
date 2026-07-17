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
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          log: vi.fn().mockResolvedValue(undefined),
        },
      },
      writable: true,
    });
    useTunnelStore.setState({
      status: 'stopped',
      url: null,
      error: null,
      health: 'unknown',
      mobileDeviceIds: new Set(),
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
      expect(useTunnelStore.getState().health).toBe('unknown');
    });

    it('sets error on API failure', async () => {
      vi.mocked(api.stopTunnel).mockRejectedValue(new Error('Stop failed'));

      await useTunnelStore.getState().stop();

      expect(useTunnelStore.getState().error).toBe('Stop failed');
    });
  });

  describe('refreshStatus', () => {
    it('updates store from API response including health and mobile devices', async () => {
      vi.mocked(api.getTunnelStatus).mockResolvedValue({
        status: 'running',
        url: 'https://xyz.trycloudflare.com',
        error: null,
        health: 'healthy',
        onlineDevices: [
          { deviceId: 'phone-1', deviceType: 'mobile', deviceName: 'iPhone' },
          { deviceId: 'desktop-1', deviceType: 'desktop', deviceName: 'Mac' },
        ],
      });

      await useTunnelStore.getState().refreshStatus();

      expect(useTunnelStore.getState().status).toBe('running');
      expect(useTunnelStore.getState().url).toBe(
        'https://xyz.trycloudflare.com'
      );
      expect(useTunnelStore.getState().health).toBe('healthy');
      expect(useTunnelStore.getState().mobileDeviceIds.size).toBe(1);
      expect(useTunnelStore.getState().mobileDeviceIds.has('phone-1')).toBe(
        true
      );
    });

    it('stops polling when status is not starting or running', async () => {
      vi.mocked(api.getTunnelStatus).mockResolvedValue({
        status: 'stopped',
        url: null,
        error: null,
        health: 'unknown',
        onlineDevices: [],
      });

      await useTunnelStore.getState().refreshStatus();

      expect(useTunnelStore.getState().status).toBe('stopped');
    });
  });

  describe('mobile device tracking', () => {
    it('addMobileDevice adds to set', () => {
      useTunnelStore.getState().addMobileDevice('phone-A');
      expect(useTunnelStore.getState().mobileDeviceIds.has('phone-A')).toBe(
        true
      );
    });

    it('addMobileDevice is idempotent', () => {
      useTunnelStore.getState().addMobileDevice('phone-A');
      useTunnelStore.getState().addMobileDevice('phone-A');
      expect(useTunnelStore.getState().mobileDeviceIds.size).toBe(1);
    });

    it('removeMobileDevice removes from set', () => {
      useTunnelStore.getState().addMobileDevice('phone-A');
      useTunnelStore.getState().removeMobileDevice('phone-A');
      expect(useTunnelStore.getState().mobileDeviceIds.size).toBe(0);
    });

    it('removeMobileDevice is safe for unknown device', () => {
      useTunnelStore.getState().removeMobileDevice('unknown');
      expect(useTunnelStore.getState().mobileDeviceIds.size).toBe(0);
    });
  });
});
