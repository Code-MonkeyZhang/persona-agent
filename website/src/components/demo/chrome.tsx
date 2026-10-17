import type { ReactNode } from 'react';

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
