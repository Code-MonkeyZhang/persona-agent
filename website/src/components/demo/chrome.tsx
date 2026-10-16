import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Screen background of the demo phone panes, radial highlights over a cool base.
 * Kept verbatim from the desktop demo PhoneScreen so pocket apps read the same.
 */
export const PHONE_BG =
  'radial-gradient(420px 300px at 88% -8%, rgba(34,139,230,0.10), transparent 60%), ' +
  'radial-gradient(360px 300px at -8% 108%, rgba(139,92,246,0.07), transparent 60%), ' +
  'linear-gradient(168deg, #e9f1fa 0%, #f3f6fb 50%, #eef1f6 100%)';

/** macOS traffic lights, purely decorative, mirrors the desktop demo window controls. */
function TrafficLights() {
  const dots = ['#ff5f57', '#febc2e', '#28c840'];
  return (
    <div className="flex items-center gap-2">
      {dots.map((color) => (
        <span key={color} className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

type DemoWindowProps = {
  title?: string;
  lights?: boolean;
  children: ReactNode;
  className?: string;
};

/** Fake desktop window chrome, lights adds the traffic lights and the title bar renders only when it has content. */
export function DemoWindow({ title, lights = false, children, className = '' }: DemoWindowProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-demo-border bg-white shadow-[0_12px_32px_-18px_rgba(10,10,10,0.25)] ${className}`}
    >
      {title || lights ? (
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-demo-border bg-white/80 pl-3 pr-3.5 backdrop-blur">
          {lights ? <TrafficLights /> : null}
          {title ? (
            <span className="truncate text-[12px] font-semibold text-demo-muted-fg">{title}</span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Centered section header shared by the staged sections. */
export function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="mx-auto max-w-2xl text-center"
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink-faint">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-ink-soft">{sub}</p>
    </motion.div>
  );
}
