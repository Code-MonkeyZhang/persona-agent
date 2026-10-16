import { motion, useReducedMotion } from 'motion/react';
import { LayoutGrid, Plus, Settings, Wifi } from 'lucide-react';
import { useLocale, type I18nKey } from '../../i18n';
import aronaAvatar from '../../assets/demo/arona-avatar.png';
import lanmaoAvatar from '../../assets/demo/lanmao-avatar.png';

/** Session rows of the mobile home list, avatar plus title, time and preview. */
const SESSIONS: Array<{ titleKey: I18nKey; previewKey: I18nKey; timeKey: I18nKey }> = [
  { titleKey: 'mob.s1t', previewKey: 'mob.s1p', timeKey: 'mob.s1time' },
  { titleKey: 'mob.s2t', previewKey: 'mob.s2p', timeKey: 'mob.s2time' },
  { titleKey: 'mob.s3t', previewKey: 'mob.s3p', timeKey: 'mob.s3time' },
];

/** Shared shadow of the mobile floating action buttons. */
const ACTION_SHADOW = 'shadow-[0_5px_16px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.07)]';

/**
 * Home screen body of the demo phone inside the frame bezel.
 * Frame metrics follow PhoneFrame verbatim, 375 by 812 with an 8px bezel and a
 * 44px status band, scaled to fit wherever it performs.
 */
function PhoneBody({ scale }: { scale: number }) {
  const { t } = useLocale();
  const reduce = useReducedMotion();

  return (
    <div style={{ width: 375 * scale, height: 812 * scale }}>
      <div
        className="relative h-[812px] w-[375px] origin-top-left overflow-hidden rounded-[40px] border-[8px] border-[#333] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
        style={{ transform: `scale(${scale})` }}
      >
        {/* Status band */}
        <div className="flex h-[44px] items-center justify-between px-6 pt-1.5 text-[14px] font-semibold text-[#1a1a1a]">
          <span>9:41</span>
          <span className="flex items-center gap-1 text-[12px]">
            <Wifi size={13} className="text-[#1a1a1a]" />
            <span className="inline-block h-[11px] w-[22px] rounded-[3px] border border-[#1a1a1a]/40 p-[1.5px]">
              <span className="block h-full w-3/4 rounded-[1px] bg-[#1a1a1a]" />
            </span>
          </span>
        </div>

        {/* Connection banner of the desktop link */}
        <div className="flex min-h-[44px] w-full items-center gap-2 bg-[#f2f3f5] px-4 py-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#007AFF]" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#999]">
            {t('mob.banner')}
          </span>
        </div>

        {/* Agent selector track */}
        <div className="flex items-start gap-5 px-4 py-3">
          <span className="flex shrink-0 flex-col items-center gap-1.5">
            <span className="rounded-full ring-2 ring-[#007AFF] ring-offset-[3px] ring-offset-white">
              <img src={aronaAvatar} alt="" className="h-14 w-14 rounded-full object-cover" />
            </span>
            <span className="max-w-[80px] truncate text-[12px] font-semibold text-[#007AFF]">
              {t('ed.n1')}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-center gap-1.5">
            <img src={lanmaoAvatar} alt="" className="h-14 w-14 rounded-full object-cover" />
            <span className="max-w-[80px] truncate text-[12px] text-[#999]">{t('ed.n2')}</span>
          </span>
        </div>

        {/* Session list */}
        <div className="mx-1 h-px bg-[#e8e8ea]" />
        <p className="px-4 pb-1 pt-3 text-[15px] text-[#999]">{t('mob.sessions')}</p>
        <div className="flex flex-col">
          {SESSIONS.map(({ titleKey, previewKey, timeKey }) => (
            <motion.div
              key={titleKey}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className="flex w-full items-start gap-3 px-3 py-2.5"
            >
              <img src={aronaAvatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-[#1a1a1a]">{t(titleKey)}</span>
                  <span className="shrink-0 text-[12px] text-[#b5b5bb]">{t(timeKey)}</span>
                </div>
                <span className="mt-0.5 block truncate text-[14px] text-[#999]">{t(previewKey)}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Floating actions */}
        <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-3">
          <span
            className={`grid h-11 w-11 place-items-center rounded-full bg-white text-[#1a1a1a] ${ACTION_SHADOW}`}
          >
            <Plus size={20} />
          </span>
          <span
            className={`grid h-11 w-11 place-items-center rounded-full bg-white text-[#1a1a1a] ${ACTION_SHADOW}`}
          >
            <LayoutGrid size={20} />
          </span>
          <span
            className={`grid h-11 w-11 place-items-center rounded-full bg-white text-[#1a1a1a] ${ACTION_SHADOW}`}
          >
            <Settings size={20} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Static replica of the mobile demo home screen at its native marketing scale. */
export default function MobileMock() {
  return (
    <div className="mx-auto w-fit">
      <PhoneBody scale={0.827} />
    </div>
  );
}
