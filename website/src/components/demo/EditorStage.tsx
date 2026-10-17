import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Volume2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale } from '../../i18n';
import { DemoWindow } from './chrome';
import { CLONED_VOICES, MODEL_GROUPS, PRESET_VOICES } from './editorCatalog';
import aronaBg from '../../assets/demo/arona-bg.jpg';
import aronaPoseDefault from '../../assets/demo/arona-pose.png';
import aronaPoseHappy from '../../assets/demo/arona-pose-happy.png';
import aronaPoseLike from '../../assets/demo/arona-pose-like.png';
import aronaPoseShy from '../../assets/demo/arona-pose-shy.png';
import aronaPoseAngry from '../../assets/demo/arona-pose-angry.png';
import aronaPoseConfused from '../../assets/demo/arona-pose-confused.png';

const POSES = [
  aronaPoseDefault,
  aronaPoseHappy,
  aronaPoseLike,
  aronaPoseShy,
  aronaPoseAngry,
  aronaPoseConfused,
];

/** Flat model list with provider labels, index pairs with the selected pose state. */
const FLAT_MODELS = MODEL_GROUPS.flatMap((group) =>
  group.models.map((model) => ({ model, providerKey: group.providerKey }))
);

/** Label column plus value slot, no card titles so the column stays calm. */
function Row({ label, top = false, children }: { label: string; top?: boolean; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-[60px_1fr] gap-2.5 ${top ? 'items-start' : 'items-center'}`}>
      <span className={`text-[12px] text-demo-muted-fg ${top ? 'pt-1.5' : ''}`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Fixed coordinates of an open menu, either top or bottom anchors it to the viewport edge. */
type MenuBox = { left: number; top?: number; bottom?: number; width: number; maxHeight: number };

/**
 * Dropdown shell shared by the model and voice pickers. The menu portals to
 * the page body with fixed coordinates so the demo window frame cannot clip
 * it, and it opens downward, flipping up when the viewport lacks room below.
 */
function Dropdown({
  open,
  onToggle,
  trigger,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef(onToggle);
  const [box, setBox] = useState<MenuBox | null>(null);

  useEffect(() => {
    toggleRef.current = onToggle;
  });

  useEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
        setBox({
          left: rect.left,
          top: rect.bottom + 4,
          width: rect.width,
          maxHeight: Math.max(160, Math.min(220, spaceBelow)),
        });
      } else {
        setBox({
          left: rect.left,
          bottom: window.innerHeight - rect.top + 4,
          width: rect.width,
          maxHeight: Math.max(160, Math.min(220, spaceAbove)),
        });
      }
    };
    measure();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      toggleRef.current();
    };
    const onViewportChange = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      measure();
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="min-w-0 flex-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-demo-border bg-white px-2.5 py-1.5 text-left text-[12.5px] text-demo-fg transition-colors hover:border-neutral-300"
      >
        <span className="flex min-w-0 items-baseline gap-1.5 truncate">{trigger}</span>
        <ChevronDown size={12} className="shrink-0 text-demo-muted-fg" />
      </button>
      {open && box ? (
        createPortal(
          <div
            ref={menuRef}
            style={{ left: box.left, top: box.top, bottom: box.bottom, width: box.width, maxHeight: box.maxHeight }}
            className="fixed z-50 overflow-auto rounded-[10px] border border-demo-border bg-white p-1.5 shadow-[0_12px_28px_-12px_rgba(10,10,10,0.25)]"
          >
            {children}
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}

/** One option row of a dropdown menu, selected state tints the row blue. */
function Opt({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12.5px] transition-colors ${
        selected ? 'bg-demo-primary/10 font-semibold text-demo-primary' : 'text-demo-fg hover:bg-demo-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** Uppercase group caption inside a dropdown menu. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-demo-muted-fg">
      {children}
    </p>
  );
}

/**
 * Static replica of the agent editor as a split pane. The left side previews
 * the standing pose and the right column holds the live controls: pose thumbs,
 * the model picker grouped by provider, the voice picker with cloned and preset
 * groups, all answering to direct clicks. The preview pane layers the poses
 * over the scene background and cross fades between them, auto rotating until
 * the visitor picks one, and reduced motion keeps it still and instant.
 */
export default function EditorStage() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const [pose, setPose] = useState(0);
  const [poseManual, setPoseManual] = useState(false);
  const [model, setModel] = useState(0);
  const [voice, setVoice] = useState('shaonv');
  const [menu, setMenu] = useState<'model' | 'voice' | null>(null);

  useEffect(() => {
    if (poseManual || reduce) return;
    const id = window.setInterval(() => setPose((current) => (current + 1) % POSES.length), 2500);
    return () => window.clearInterval(id);
  }, [poseManual, reduce]);

  const current = FLAT_MODELS[model];

  return (
    <DemoWindow title={t('ed.winTitle')}>
      <div className="grid md:grid-cols-[224px_1fr]">
        <div className="relative h-[212px] overflow-hidden border-b border-demo-border bg-[#fbfaf8] md:h-auto md:border-b-0 md:border-r">
          <img src={aronaBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {POSES.map((src, index) => (
            <motion.img
              key={src}
              src={src}
              alt=""
              initial={false}
              animate={{ opacity: pose === index ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: 'linear' }}
              className="absolute bottom-0 left-1/2 z-[1] h-full -translate-x-1/2 object-contain object-bottom"
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 p-4">
          <Row label={t('ed.name')}>
            <span className="block truncate rounded-lg border border-demo-border bg-white px-2.5 py-1.5 text-[12.5px] text-demo-fg">
              {t('ed.n1')}
            </span>
          </Row>

          <Row label={t('ed.pose')}>
            <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {POSES.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => {
                    setPose(index);
                    setPoseManual(true);
                  }}
                  aria-label={t('ed.pose')}
                  className={`h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg border bg-white transition-colors ${
                    pose === index
                      ? 'border-demo-primary ring-1 ring-demo-primary/35'
                      : 'border-demo-border hover:border-neutral-300'
                  }`}
                >
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          </Row>

          <Row label={t('ed.model')}>
            <Dropdown
              open={menu === 'model'}
              onToggle={() => setMenu(menu === 'model' ? null : 'model')}
              trigger={
                <>
                  <span className="truncate font-medium">{current.model}</span>
                  <span className="shrink-0 text-[11px] text-demo-muted-fg">{t(current.providerKey)}</span>
                </>
              }
            >
              {MODEL_GROUPS.map((group) => (
                <div key={group.providerKey}>
                  <GroupLabel>{t(group.providerKey)}</GroupLabel>
                  {group.models.map((name) => (
                    <Opt
                      key={name}
                      selected={current.model === name}
                      onClick={() => {
                        setModel(FLAT_MODELS.findIndex((entry) => entry.model === name));
                        setMenu(null);
                      }}
                    >
                      <span>{name}</span>
                    </Opt>
                  ))}
                </div>
              ))}
            </Dropdown>
          </Row>

          <Row label={t('ed.voice')}>
            <div className="flex items-center gap-2">
              <Dropdown
                open={menu === 'voice'}
                onToggle={() => setMenu(menu === 'voice' ? null : 'voice')}
                trigger={
                  voice === 'none' ? (
                    <span className="truncate font-medium">{t('ed.vNone')}</span>
                  ) : (
                    (() => {
                      const option = [...CLONED_VOICES, ...PRESET_VOICES].find((entry) => entry.id === voice);
                      return (
                        <>
                          <span className="truncate font-medium">{t(option!.nameKey)}</span>
                          <span className="shrink-0 text-[11px] text-demo-muted-fg">{t(option!.tagKey!)}</span>
                        </>
                      );
                    })()
                  )
                }
              >
                <Opt selected={voice === 'none'} onClick={() => { setVoice('none'); setMenu(null); }}>
                  <span>{t('ed.vNone')}</span>
                </Opt>
                <GroupLabel>{t('ed.vgClone')}</GroupLabel>
                {CLONED_VOICES.map((option) => (
                  <Opt key={option.id} selected={voice === option.id} onClick={() => { setVoice(option.id); setMenu(null); }}>
                    <span>{t(option.nameKey)}</span>
                    <span className="text-[11px] text-demo-muted-fg">{t(option.tagKey!)}</span>
                  </Opt>
                ))}
                <GroupLabel>{t('ed.vgPreset')}</GroupLabel>
                {PRESET_VOICES.map((option) => (
                  <Opt key={option.id} selected={voice === option.id} onClick={() => { setVoice(option.id); setMenu(null); }}>
                    <span>{t(option.nameKey)}</span>
                    <span className="text-[11px] text-demo-muted-fg">{t(option.tagKey!)}</span>
                  </Opt>
                ))}
              </Dropdown>
              <button
                type="button"
                aria-label={t('ed.listen')}
                className="flex h-[31px] w-8 shrink-0 items-center justify-center rounded-lg border border-demo-border bg-white text-demo-muted-fg transition-colors hover:border-neutral-300 hover:text-demo-fg"
              >
                <Volume2 size={13} />
              </button>
            </div>
          </Row>

          <Row label={t('ed.prompt')} top>
            <p className="whitespace-pre-line rounded-lg border border-demo-border bg-white px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-neutral-600">
              {t('ed.promptVal')}
            </p>
          </Row>
        </div>
      </div>
    </DemoWindow>
  );
}
