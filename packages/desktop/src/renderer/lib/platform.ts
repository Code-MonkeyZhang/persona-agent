/**
 * @file src/renderer/lib/platform.ts
 * @description 平台检测工具，判断当前运行环境为 macOS/Windows/Linux
 */
const platform = window.electron?.process?.platform;

export const isMac = platform === 'darwin';
export const isWin = platform === 'win32';
export const isLinux = platform === 'linux';

/**
 * 拼接数据存储路径，用于 UI 展示和 openPath 调用。
 * xdg-basedir 在所有平台上均使用 ~/.local/share，因此无需区分平台。
 */
export function dataPath(sub: string): string {
  return `~/.local/share/persona-agent/${sub}/`;
}
