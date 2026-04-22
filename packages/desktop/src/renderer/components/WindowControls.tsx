/**
 * @file src/renderer/components/WindowControls.tsx
 * @description 窗口控制按钮组件，提供最小化、最大化/还原、关闭功能，仅 Windows 和 Linux 显示
 */
import { useState, useEffect } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { isWin, isLinux } from '../lib/platform';

/**
 * 窗口还原图标（最大化状态下显示）
 * 使用 SVG 绘制两个重叠的矩形表示还原状态
 */
const WindowRestoreIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect
      width="14"
      height="14"
      x="2.76"
      y="7.07"
      rx="1.24"
      style={{ strokeWidth: '1.57' }}
    />
    <path
      d="M 8.89,2.83 C 8.39,2.83 7.94,3.07 7.66,3.45 H 18.99 c 0.87,0 1.56,0.70 1.56,1.56 v 11.33 c 0.37,-0.28 0.62,-0.72 0.62,-1.23 V 4.36 c 0,-0.85 -0.69,-1.54 -1.54,-1.54 z"
      style={{ strokeWidth: '0.91' }}
    />
  </svg>
);

/**
 * 窗口控制按钮组件
 * 仅在 Windows 和 Linux 上显示，macOS 使用系统原生红绿灯按钮
 */
export const WindowControls = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.api?.windowControls.isMaximized().then(setIsMaximized);
    const unsubscribe =
      window.api?.windowControls.onMaximizedChange(setIsMaximized);
    return () => unsubscribe?.();
  }, []);

  if (!isWin && !isLinux) return null;

  const handleMaximize = () => {
    if (isMaximized) {
      window.api?.windowControls.unmaximize();
    } else {
      window.api?.windowControls.maximize();
    }
  };

  return (
    <div
      className="flex items-center h-14 select-none z-50"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        className="flex items-center justify-center w-[46px] h-full bg-transparent border-none cursor-pointer hover:bg-black/10 transition-colors"
        onClick={() => window.api?.windowControls.minimize()}
      >
        <Minus size={14} />
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full bg-transparent border-none cursor-pointer hover:bg-black/10 transition-colors"
        onClick={handleMaximize}
      >
        {isMaximized ? <WindowRestoreIcon size={14} /> : <Square size={14} />}
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full bg-transparent border-none cursor-pointer hover:bg-[#e81123] hover:text-white transition-colors"
        onClick={() => window.api?.windowControls.close()}
      >
        <X size={17} />
      </button>
    </div>
  );
};
