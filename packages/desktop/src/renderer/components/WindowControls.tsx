/**
 * @file src/renderer/components/WindowControls.tsx
 * @description macOS 红绿灯风格的窗口控制按钮组件，提供关闭、最小化、最大化/还原功能
 * 仅在 Windows 和 Linux 上显示（macOS 使用系统原生红绿灯按钮）
 */
import { useState, useEffect } from 'react';
import { Minus, X } from 'lucide-react';
import { isWin, isLinux } from '../lib/platform';

/**
 * 最大化状态下的还原图标，使用 SVG 绘制两个重叠矩形表示还原窗口
 */
const RestoreIcon = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
    <rect
      x="0.5"
      y="2.5"
      width="7"
      height="7"
      rx="1"
      stroke="currentColor"
      strokeWidth="1"
    />
    <path
      d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1"
      stroke="currentColor"
      strokeWidth="1"
    />
  </svg>
);

/** 单个红绿灯按钮的属性 */
interface LightButtonProps {
  color: string;
  hoverColor: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
}

/**
 * 单个红绿灯按钮，默认显示纯色圆点，hover 时显示操作图标并加深背景
 */
const LightButton = ({
  color,
  hoverColor,
  icon,
  onClick,
  ariaLabel,
}: LightButtonProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      className="rounded-full flex items-center justify-center shrink-0 transition-colors"
      style={{
        width: 12,
        height: 12,
        backgroundColor: hovered ? hoverColor : color,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {hovered && <span style={{ color: 'rgba(0,0,0,0.5)' }}>{icon}</span>}
    </button>
  );
};

/**
 * 窗口控制按钮组件（macOS 红绿灯风格）
 * 仅在 Windows 和 Linux 上显示，macOS 使用系统原生红绿灯按钮
 * 不处理自身定位，由父组件控制位置
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
      className="flex items-center gap-[8px] header-no-drag"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <LightButton
        color="#ff5f57"
        hoverColor="#ff3b30"
        icon={<X size={8} strokeWidth={2.5} />}
        onClick={() => window.api?.windowControls.close()}
        ariaLabel="Close"
      />
      <LightButton
        color="#febc2e"
        hoverColor="#f5a623"
        icon={<Minus size={8} strokeWidth={2.5} />}
        onClick={() => window.api?.windowControls.minimize()}
        ariaLabel="Minimize"
      />
      <LightButton
        color="#28c840"
        hoverColor="#1db954"
        icon={
          isMaximized ? (
            <RestoreIcon size={8} />
          ) : (
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          )
        }
        onClick={handleMaximize}
        ariaLabel={isMaximized ? 'Restore' : 'Maximize'}
      />
    </div>
  );
};
