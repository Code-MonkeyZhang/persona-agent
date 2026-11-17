/**
 * @file main/close-behavior.ts
 * @description 关闭驻留的纯决策函数，不依赖 Electron，供主进程 close 处理与单测共用
 */

export interface CloseBehaviorInput {
  platform: NodeJS.Platform;
  quitting: boolean;
  closeToTrayEnabled: boolean;
  isFullScreen: boolean;
}

/**
 * 判定一次窗口关闭是否应转为隐藏驻留
 * - 退出流程中放行真关闭，防止 quit 被拦截成隐藏导致进程挂住
 * - 开关关闭或非 mac 与 win 平台时维持原有关闭语义
 * - mac 全屏时不拦截，避免恢复时全屏状态错乱
 */
export function shouldHideOnClose(input: CloseBehaviorInput): boolean {
  if (input.quitting || !input.closeToTrayEnabled) return false;
  if (input.platform === 'darwin') return !input.isFullScreen;
  return input.platform === 'win32';
}
