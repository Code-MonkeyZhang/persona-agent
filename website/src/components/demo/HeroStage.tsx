import { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import HeroScene from './HeroScene';

/** Stage height of the full window so the demo never shifts the page layout. */
const STAGE_HEIGHT = 496;

/**
 * Auto playing demo player of the hero.
 * One scene runs a twelve second loop, hovering freezes the scene clock and
 * every CSS driven motion, and reduced motion visitors get the final frame.
 */
export default function HeroStage() {
  const reduced = useReducedMotion() ?? false;
  const [paused, setPaused] = useState(false);

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div
        className={`select-none overflow-hidden ${paused ? 'player-paused' : ''}`}
        style={{ height: STAGE_HEIGHT }}
      >
        <HeroScene running={!paused} reduced={reduced} />
      </div>
    </div>
  );
}
