import { useEffect, useRef, useState } from 'react';

/**
 * Scene clock that drives the frame playback of one hero demo scene.
 * The clock stores elapsed milliseconds and ticks on a coarse interval so the
 * scenes can derive their frame state from time thresholds. It freezes when
 * running turns false, resumes from the frozen position, wraps back to zero
 * once elapsed passes duration so the scene loops, and jumps straight to the
 * final frame when the visitor prefers reduced motion.
 */
export function useSceneClock(duration: number, running: boolean, reduced: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const saved = useRef(0);

  useEffect(() => {
    saved.current = 0;
    setElapsed(0);
  }, [duration]);

  useEffect(() => {
    if (!running) return;
    if (reduced) {
      saved.current = duration;
      setElapsed(duration);
      return;
    }
    const startedAt = performance.now() - saved.current;
    const id = window.setInterval(() => {
      const value = (performance.now() - startedAt) % duration;
      saved.current = value;
      setElapsed(value);
    }, 80);
    return () => window.clearInterval(id);
  }, [running, duration, reduced]);

  return elapsed;
}
