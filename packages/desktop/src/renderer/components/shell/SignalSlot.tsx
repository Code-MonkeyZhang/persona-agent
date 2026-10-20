/**
 * @file src/renderer/components/shell/SignalSlot.tsx
 * @description 会话行与聊天入口的运行与未读信号位。
 *
 * 运行中是 primary 色九宫格波纹,SpinKit cube grid 口径,轮末不在场
 * 落成未读实心圆点,bool 语义不计数,空闲已读透明占位,标题文字不跳动。
 * 运行优先于未读,波纹的格子盖过静态点,前台会话的抑制由调用方传入前完成。
 */

import React from 'react';
import { cn } from '../../lib/utils';

/**
 * 九宫格的九个方块,延迟按列减行乘步长做对角波纹递推,
 * 负一周期让首格与零延迟等价,公式统一无特例。
 */
const GRID_CUBES = Array.from({ length: 9 }, (_, i) => ({
  key: i,
  delay: `${((i % 3) - Math.floor(i / 3)) * 0.1 - 1.1}s`,
}));

interface SignalSlotProps {
  /** 运行中标志,九宫格波纹表达在干活 */
  running: boolean;
  /** 未读标志,bool 不计数,轮末不在场置位,点进会话清除 */
  unread: boolean;
  /** 位置微调透传,入口卡贴右上等场景 */
  className?: string;
}

/**
 * 会话信号位组件,运行与未读共用同一个常驻占位。
 */
export const SignalSlot: React.FC<SignalSlotProps> = ({
  running,
  unread,
  className,
}) => (
  <span
    className={cn(
      'w-6 h-4 flex items-center justify-center shrink-0',
      className
    )}
  >
    {running ? (
      <span className="signal-grid">
        {GRID_CUBES.map((c) => (
          <span key={c.key} style={{ '--d': c.delay } as React.CSSProperties} />
        ))}
      </span>
    ) : (
      unread && <span className="w-[8px] h-[8px] rounded-full bg-primary" />
    )}
  </span>
);
