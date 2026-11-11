/**
 * @fileoverview 关闭驻留决策测试：退出标志旁路、开关关闭、平台差异与 mac 全屏放行。
 */

import { describe, it, expect } from 'vitest';
import { shouldHideOnClose } from '../src/main/close-behavior';

describe('shouldHideOnClose', () => {
  it('hides on mac when the toggle is on and the window is normal', () => {
    expect(
      shouldHideOnClose({
        platform: 'darwin',
        quitting: false,
        closeToTrayEnabled: true,
        isFullScreen: false,
      })
    ).toBe(true);
  });

  it('hides on windows regardless of fullscreen state', () => {
    expect(
      shouldHideOnClose({
        platform: 'win32',
        quitting: false,
        closeToTrayEnabled: true,
        isFullScreen: true,
      })
    ).toBe(true);
  });

  it('allows the real close while quitting even when everything else would hide', () => {
    expect(
      shouldHideOnClose({
        platform: 'win32',
        quitting: true,
        closeToTrayEnabled: true,
        isFullScreen: false,
      })
    ).toBe(false);
  });

  it('keeps the original close semantics when the toggle is off', () => {
    expect(
      shouldHideOnClose({
        platform: 'darwin',
        quitting: false,
        closeToTrayEnabled: false,
        isFullScreen: false,
      })
    ).toBe(false);
  });

  it('never hides on linux so closing still quits the app', () => {
    expect(
      shouldHideOnClose({
        platform: 'linux',
        quitting: false,
        closeToTrayEnabled: true,
        isFullScreen: false,
      })
    ).toBe(false);
  });

  it('allows the real close on mac fullscreen to avoid restore glitches', () => {
    expect(
      shouldHideOnClose({
        platform: 'darwin',
        quitting: false,
        closeToTrayEnabled: true,
        isFullScreen: true,
      })
    ).toBe(false);
  });
});
