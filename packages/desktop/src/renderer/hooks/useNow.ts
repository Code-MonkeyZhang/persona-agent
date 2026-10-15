/**
 * @file hooks/useNow.ts
 * @description 每秒跳动的当前时间，手机屏桌面时钟订阅。
 */

import { useEffect, useState } from 'react';

/** 秒级刷新的当前时间，卸载时清理计时器 */
export function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}
