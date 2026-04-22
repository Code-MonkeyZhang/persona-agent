/**
 * @file src/renderer/lib/platform.ts
 * @description 平台检测工具，判断当前运行环境为 macOS/Windows/Linux
 */
const platform = window.electron?.process?.platform;

export const isMac = platform === 'darwin';
export const isWin = platform === 'win32';
export const isLinux = platform === 'linux';
