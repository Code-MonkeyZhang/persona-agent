import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUp,
  Check,
  Compass,
  Loader2,
  MonitorSmartphone,
  Settings,
  VenetianMask,
} from 'lucide-react';
import { useLocale } from '../../i18n';
import aronaAvatar from '../../assets/demo/arona-avatar.png';
import kurisuAvatar from '../../assets/demo/kurisu-avatar.png';

/** Left agent rail of the demo window, the ring marks the active agent and the nav icons anchor to the bottom. */
export function AgentRail() {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-demo-border py-3">
      <span className="rounded-full ring-2 ring-demo-primary ring-offset-2 ring-offset-white">
        <img src={aronaAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
      </span>
      <img src={kurisuAvatar} alt="" className="h-9 w-9 rounded-full object-cover opacity-60" />
      <div className="grow" />
      <Compass size={17} className="text-demo-muted-fg" />
      <MonitorSmartphone size={17} className="text-demo-muted-fg" />
      <Settings size={17} className="text-demo-muted-fg" />
    </div>
  );
}

/** Chat header replica, a slim strip where companionActive marks the companion pane as engaged. */
export function ChatHeader({ companionActive = false }: { companionActive?: boolean }) {
  const { t } = useLocale();
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-demo-border px-4">
      <span className="truncate text-[12px] font-semibold text-demo-fg">{t('hwin.s1')}</span>
      <span
        className={`flex h-[22px] shrink-0 items-center gap-1 rounded-md border px-2 text-[10.5px] ${
          companionActive
            ? 'border-demo-primary/20 bg-demo-primary/10 text-demo-primary'
            : 'border-demo-border text-demo-muted-fg'
        }`}
      >
        <VenetianMask size={12} />
        {t('hwin.btnCompanion')}
      </span>
    </div>
  );
}

/** Input box replica, typed renders the self typing message and caret blinks while typing. */
export function InputBox({ typed, caret = false }: { typed: string; caret?: boolean }) {
  const { t } = useLocale();
  const armed = typed.trim().length > 0;
  return (
    <div className="shrink-0 px-4 pb-4">
      <div className="flex flex-col rounded-[24px] bg-white ring-1 ring-demo-fg/20">
        <div className="min-h-[40px] px-3 pb-1 pt-3 text-[14px] leading-normal text-demo-fg">
          {armed || caret ? (
            typed
          ) : (
            <span className="text-demo-placeholder">{t('hwin.inputPh')}</span>
          )}
          {caret ? (
            <span className="caret-blink ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] bg-demo-primary" />
          ) : null}
        </div>
        <div className="flex items-center justify-end px-2 pb-2 pt-1">
          <span
            className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
              armed ? 'bg-demo-primary text-white' : 'bg-demo-muted text-white/70'
            }`}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** User message row with the U avatar and the primary blue bubble. */
export function UserRow({ text }: { text: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-row-reverse items-start gap-2.5"
    >
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">
        U
      </span>
      <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-demo-primary px-4 py-2.5 text-[13px] leading-relaxed text-white">
        {text}
      </div>
    </motion.div>
  );
}

/** Agent message row wrapper, children render as the bubble or chip payload. */
export function AgentRow({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-start gap-2.5"
    >
      <img src={aronaAvatar} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
      {children}
    </motion.div>
  );
}

/** Agent reply bubble, one paragraph per streamed line. */
export function AgentBubble({ lines }: { lines: string[] }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-demo-muted px-4 py-2.5 text-demo-fg">
      {lines.map((line) => (
        <p key={line} className="text-[13px] leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}

/** Thinking chip shown while the agent plans before the tool call. */
export function ThinkingChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-demo-border bg-white px-3 py-1.5 text-[11px] font-semibold text-demo-muted-fg">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-demo-primary" />
      {label}
    </span>
  );
}

/** Tool invocation card, done swaps the spinner for the green check. */
export function ToolCard({ title, lines, done }: { title: string; lines: string[]; done: boolean }) {
  return (
    <div className="flex w-fit flex-col items-start gap-1 rounded-lg border border-demo-border bg-[#fbfaf8] px-3.5 py-2.5">
      <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-demo-fg">
        {done ? (
          <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-green-100 text-green-600">
            <Check size={9} strokeWidth={3} />
          </span>
        ) : (
          <Loader2 size={13} className="animate-spin text-demo-primary" />
        )}
        {title}
      </span>
      {lines.map((line) => (
        <p key={line} className="text-[11px] leading-relaxed text-demo-muted-fg">
          {line}
        </p>
      ))}
    </div>
  );
}
