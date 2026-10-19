import { useEffect, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion, type Variant } from 'motion/react';
import { useLocale } from '../../i18n';
import { useSceneClock } from './useSceneClock';
import aronaAvatar from '../../assets/demo/arona-avatar.png';
import kurisuAvatar from '../../assets/demo/kurisu-avatar.png';
import aronaBg from '../../assets/demo/arona-bg.jpg';
import aronaPose from '../../assets/demo/arona-pose.png';

/** Frame thresholds of the tunnel scene in milliseconds. */
const T = {
  phoneIn: 250,
  wire: 800,
  tag: 1400,
  banner: 1900,
  agents: 2500,
  s1: 3000,
  s2: 3500,
  s3: 4000,
  pcSay: 5300,
};

const DURATION = 8000;

/** Travel loop of one tunnel pulse, custom carries the stagger delay in seconds. */
const flowPulse: Variant = (delay: number) => ({
  x: ['0%', '15%', '85%', '100%'],
  opacity: [0, 1, 1, 0],
  transition: {
    delay,
    duration: 2.2,
    times: [0, 0.15, 0.85, 1],
    ease: 'linear',
    repeat: Infinity,
  },
});

/** Vertical twin of flowPulse for the stacked layout, pulses drop along the y axis. */
const flowPulseDown: Variant = (delay: number) => ({
  y: ['0%', '15%', '85%', '100%'],
  opacity: [0, 1, 1, 0],
  transition: {
    delay,
    duration: 2.2,
    times: [0, 0.15, 0.85, 1],
    ease: 'linear',
    repeat: Infinity,
  },
});

const SESSIONS = [
  { titleKey: 'mob.s1t', previewKey: 'mob.s1p', timeKey: 'mob.s1time', at: T.s1 },
  { titleKey: 'mob.s2t', previewKey: 'mob.s2p', timeKey: 'mob.s2time', at: T.s2 },
  { titleKey: 'mob.s3t', previewKey: 'mob.s3p', timeKey: 'mob.s3time', at: T.s3 },
] as const;

/** One session row of the phone home list, avatar plus title, time and preview. */
function SessionRow({
  avatar,
  title,
  preview,
  time,
  show,
}: {
  avatar: string;
  title: string;
  preview: string;
  time: string;
  show: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 px-2.5 py-1.5 ${show ? 'demo-pop' : 'invisible'}`}>
      <img src={avatar} alt="" className="h-[26px] w-[26px] shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="truncate text-[10.5px] font-medium text-[#1a1a1a]">{title}</span>
          <span className="shrink-0 text-[9.5px] text-[#b5b5bb]">{time}</span>
        </div>
        <span className="mt-px block truncate text-[10.5px] text-[#999]">{preview}</span>
      </div>
    </div>
  );
}

/**
 * Auto playing tunnel scene of the mobile section. The wire grows from the
 * desktop all-in-one to the phone, pulses keep flowing along it, the phone
 * home screen lights up layer by layer, and the desktop bubble mirrors the
 * latest reply. Hovering freezes the scene clock and every CSS driven motion.
 */
export default function MobileStage() {
  const { t } = useLocale();
  const reduced = useReducedMotion() ?? false;
  const [paused, setPaused] = useState(false);
  const elapsed = useSceneClock(DURATION, !paused, reduced);

  // Hovering freezes each pulse wherever it is and resuming restarts the loop from its start.
  const pulse = useAnimationControls();
  useEffect(() => {
    if (paused) {
      pulse.stop();
    } else {
      pulse.start('flow');
    }
  }, [paused, pulse]);

  const phoneIn = reduced || elapsed >= T.phoneIn;
  const linked = reduced || elapsed >= T.wire;
  const tag = reduced || elapsed >= T.tag;
  const banner = reduced || elapsed >= T.banner;
  const agents = reduced || elapsed >= T.agents;
  const pcSay = reduced || elapsed >= T.pcSay;

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div
        className={`flex select-none flex-col items-center justify-center gap-2 py-6 sm:flex-row ${paused ? 'player-paused' : ''}`}
      >
        {/* Desktop all-in-one, a miniature of the companion app shown in the hero. */}
        <div className="flex w-[280px] max-w-full shrink-0 flex-col items-center">
          <div className="flex h-[176px] w-full overflow-hidden rounded-t-[10px] border-2 border-b-0 border-[#d8d2c4] bg-white shadow-[0_6px_18px_-10px_rgba(10,10,10,0.18)]">
            <div className="flex w-[26px] shrink-0 flex-col items-center gap-1.5 border-r border-demo-border py-1.5">
              <img
                src={aronaAvatar}
                alt=""
                className="h-[16px] w-[16px] rounded-full object-cover"
              />
              <img src={kurisuAvatar} alt="" className="h-[16px] w-[16px] rounded-full object-cover" />
              <div className="grow" />
              <span className="text-[7px] leading-none">🧭</span>
              <span className="text-[7px] leading-none">📱</span>
              <span className="text-[7px] leading-none">⚙️</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-[15px] shrink-0 items-center justify-between border-b border-demo-border px-1.5">
                <span className="text-[7.5px] font-bold text-demo-fg">{t('hwin.s1')}</span>
                <span className="rounded-full border border-demo-border px-1 text-[6px] leading-[9px] text-demo-muted-fg">
                  {t('hwin.btnCompanion')}
                </span>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <img src={aronaBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <img
                  src={aronaPose}
                  alt=""
                  className="absolute bottom-0 left-1/2 h-[90%] -translate-x-1/2 object-contain object-bottom"
                />
                {pcSay ? (
                  <div className="demo-pop absolute inset-x-2 bottom-[26px] z-[2] rounded-lg bg-white/90 px-1.5 py-1 text-[8.5px] leading-relaxed text-demo-fg shadow-[0_1px_6px_rgba(0,0,0,0.1)]">
                    {t('comp.b2')}
                  </div>
                ) : null}
                <div className="absolute inset-x-1.5 bottom-1 z-[2] flex items-center gap-1 rounded-full border border-demo-fg/20 bg-white px-2 py-[3px]">
                  <span className="min-w-0 flex-1 truncate text-[7.5px] text-demo-muted-fg">
                    {t('hwin.inputPh')}
                  </span>
                  <span className="h-[9px] w-[9px] shrink-0 rounded-[3px] bg-demo-primary" />
                </div>
              </div>
            </div>
          </div>
          <div className="relative flex h-[12px] w-full items-center justify-center rounded-b-[9px] border-2 border-t-0 border-[#d8d2c4] bg-gradient-to-b from-[#f4f1ea] to-[#e6e1d5]">
            <span className="h-[3.5px] w-[14px] rounded-[2px] bg-[#c9c3b5]" />
          </div>
          <div className="-mt-px h-[18px] w-[14px] rounded-b-[3px] bg-gradient-to-b from-[#e8e3d8] to-[#d3cdbf]" />
          <div className="h-[8px] w-[80px] rounded-b-[10px] bg-gradient-to-b from-[#e8e3d8] to-[#c9c3b5] shadow-[0_8px_12px_-7px_rgba(10,10,10,0.3)]" />
        </div>

        {/* Tunnel wire for narrow viewports, drops from the desktop stand down to the phone. */}
        <div className="relative -my-2 h-[72px] w-[240px] max-w-full shrink-0 sm:hidden">
          <motion.div
            initial={false}
            animate={{ scaleY: linked ? 1 : 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="absolute inset-y-0 left-1/2 origin-top border-l-2 border-dashed border-[#c9c4b8]"
          />
          {/* The pill keeps clear of the line with plain offsets so demo-pop never fights a translate class. */}
          {tag ? (
            <span className="demo-pop absolute left-[calc(50%+14px)] top-1/2 -mt-2.5 whitespace-nowrap rounded-full border border-demo-border bg-white px-2.5 py-0.5 text-[9.5px] font-semibold text-demo-primary">
              {t('mob.tunnel')}
            </span>
          ) : null}
          <div
            className={`absolute inset-y-0 left-1/2 transition-opacity duration-300 ${linked ? 'opacity-100' : 'opacity-0'}`}
          >
            {!reduced
              ? [0, 0.7, 1.4].map((delay) => (
                  <motion.span
                    key={delay}
                    custom={delay}
                    variants={{ flow: flowPulseDown }}
                    animate={pulse}
                    initial={false}
                    className="absolute top-0 left-[-3.5px] h-full w-[7px] opacity-0"
                  >
                    <span className="block h-[7px] w-[7px] rounded-full bg-demo-primary" />
                  </motion.span>
                ))
              : null}
          </div>
        </div>

        {/* Tunnel wire, grows once then keeps carrying pulses toward the phone. */}
        <div className="relative -ml-0.5 -mr-2 hidden h-[120px] max-w-[230px] flex-1 shrink-0 sm:block">
          <motion.div
            initial={false}
            animate={{ scaleX: linked ? 1 : 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="absolute inset-x-0 top-[42px] origin-left border-t-2 border-dashed border-[#c9c4b8]"
          />
          {tag ? (
            <span className="demo-pop absolute left-1/2 top-[42px] -translate-x-1/2 -translate-y-[150%] whitespace-nowrap rounded-full border border-demo-border bg-white px-2.5 py-0.5 text-[9.5px] font-semibold text-demo-primary">
              {t('mob.tunnel')}
            </span>
          ) : null}
          <div
            className={`absolute inset-x-0 top-[42px] transition-opacity duration-300 ${linked ? 'opacity-100' : 'opacity-0'}`}
          >
            {!reduced
              ? [0, 0.7, 1.4].map((delay) => (
                  <motion.span
                    key={delay}
                    custom={delay}
                    variants={{ flow: flowPulse }}
                    animate={pulse}
                    initial={false}
                    className="absolute left-0 top-[-3.5px] h-[7px] w-full opacity-0"
                  >
                    <span className="block h-[7px] w-[7px] rounded-full bg-demo-primary" />
                  </motion.span>
                ))
              : null}
          </div>
        </div>

        {/* Phone replica, slides in and lights up its home screen layer by layer. */}
        <motion.div
          initial={false}
          animate={{ opacity: phoneIn ? 1 : 0, y: phoneIn ? 0 : 18 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="w-[198px] shrink-0 rounded-[34px] bg-[#1a1a1a] p-2 shadow-[0_18px_36px_-18px_rgba(10,10,10,0.5)]"
        >
          <div className="flex h-[368px] flex-col overflow-hidden rounded-[26px] bg-white">
            <div className="flex items-center justify-between px-3.5 pb-1 pt-2 text-[10px] font-semibold text-[#1a1a1a]">
              <span>9:41</span>
              <span className="block h-[8.5px] w-[17px] rounded-[2.5px] border border-[#1a1a1a] p-px">
                <span className="block h-full w-[70%] rounded-[1px] bg-[#1a1a1a]" />
              </span>
            </div>

            <div
              className={`flex items-center gap-1.5 bg-[#e8f1fe] px-3 py-[7px] text-[10.5px] font-semibold text-[#007AFF] ${banner ? 'demo-pop' : 'invisible'}`}
            >
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#007AFF]" />
              <span className="min-w-0 flex-1 truncate">{t('mob.banner')}</span>
            </div>

            <div className={`flex gap-3.5 px-3 pb-1 pt-2.5 ${agents ? 'demo-pop' : 'invisible'}`}>
              <span className="flex shrink-0 flex-col items-center gap-1">
                <span className="rounded-full ring-2 ring-[#007AFF] ring-offset-[2.5px] ring-offset-white">
                  <img src={aronaAvatar} alt="" className="h-[38px] w-[38px] rounded-full object-cover" />
                </span>
                <span className="max-w-[80px] truncate text-[10px] font-semibold text-[#007AFF]">
                  {t('mob.agent1')}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-center gap-1">
                <img src={kurisuAvatar} alt="" className="h-[38px] w-[38px] rounded-full object-cover" />
                <span className="max-w-[80px] truncate text-[10px] font-semibold text-[#999]">
                  {t('mob.agent2')}
                </span>
              </span>
            </div>

            <div className="mx-1.5 mt-1.5 h-px bg-[#e8e8ea]" />
            <p
              className={`px-3 pb-0.5 pt-2 text-[11px] text-[#999] ${agents ? 'demo-pop' : 'invisible'}`}
            >
              {t('mob.sessions')}
            </p>
            <div className="flex flex-col">
              {SESSIONS.map((row) => (
                <SessionRow
                  key={row.titleKey}
                  avatar={aronaAvatar}
                  title={t(row.titleKey)}
                  preview={t(row.previewKey)}
                  time={t(row.timeKey)}
                  show={reduced || elapsed >= row.at}
                />
              ))}
            </div>

            <div className="mx-auto mb-2 mt-auto h-1 w-[70px] rounded-full bg-[#1a1a1a] opacity-25" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
