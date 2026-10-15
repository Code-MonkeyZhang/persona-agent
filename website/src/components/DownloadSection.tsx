import { Monitor, Apple, Smartphone, Download, ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale } from '../i18n';
import {
  useLatestReleases,
  detectPlatform,
  DESKTOP_RELEASES_URL,
  MOBILE_RELEASES_URL,
  APP_STORE_URL,
  type Platform,
} from '../lib/releases';

type CardId = 'mac-arm' | 'mac-x64' | 'win' | 'ios' | 'android';

function detectedCardOf(platform: Platform): CardId | null {
  switch (platform) {
    case 'mac':
      return 'mac-arm';
    case 'win':
      return 'win';
    case 'ios':
      return 'ios';
    case 'android':
      return 'android';
    default:
      return null;
  }
}

export default function DownloadSection() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const releases = useLatestReleases();
  const detected = detectedCardOf(detectPlatform());

  const cards: Array<{
    id: CardId;
    icon: typeof Monitor;
    title: string;
    metaKey: 'dl.metaMacArm' | 'dl.metaMacX64' | 'dl.metaWin' | 'dl.metaIos' | 'dl.metaAndroid';
    href: string;
    labelKey: 'dl.btn' | 'dl.btnIos' | 'dl.btnAndroid';
    version?: string | null;
    external?: boolean;
  }> = [
    {
      id: 'mac-arm',
      icon: Monitor,
      title: 'macOS · Apple Silicon',
      metaKey: 'dl.metaMacArm',
      href: releases.desktopAssets.macArm ?? DESKTOP_RELEASES_URL,
      labelKey: 'dl.btn',
      version: releases.desktopVersion,
    },
    {
      id: 'mac-x64',
      icon: Monitor,
      title: 'macOS · Intel',
      metaKey: 'dl.metaMacX64',
      href: releases.desktopAssets.macX64 ?? DESKTOP_RELEASES_URL,
      labelKey: 'dl.btn',
      version: releases.desktopVersion,
    },
    {
      id: 'win',
      icon: Monitor,
      title: 'Windows · x64',
      metaKey: 'dl.metaWin',
      href: releases.desktopAssets.win ?? DESKTOP_RELEASES_URL,
      labelKey: 'dl.btn',
      version: releases.desktopVersion,
    },
    {
      id: 'ios',
      icon: Apple,
      title: 'iOS',
      metaKey: 'dl.metaIos',
      href: APP_STORE_URL,
      labelKey: 'dl.btnIos',
      external: true,
    },
    {
      id: 'android',
      icon: Smartphone,
      title: 'Android',
      metaKey: 'dl.metaAndroid',
      href: releases.androidApk ?? MOBILE_RELEASES_URL,
      labelKey: 'dl.btnAndroid',
      version: releases.androidVersion,
    },
  ];

  return (
    <section id="download" className="scroll-mt-16 border-t border-paper-line bg-paper-tint py-16">
      <div className="container-wide">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink-faint">
            {t('dl.eyebrow')}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {t('dl.title')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-soft">{t('dl.sub')}</p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const isDetected = card.id === detected;
            return (
              <motion.div
                key={card.id}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className={`relative flex flex-col rounded-2xl border bg-paper p-6 ${
                  isDetected
                    ? 'border-ink shadow-[0_16px_32px_-20px_rgba(10,10,10,0.3)]'
                    : 'border-paper-line'
                }`}
              >
                {isDetected && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-paper">
                    {t('dl.detected')}
                  </span>
                )}
                <div className="mb-2 flex items-center gap-2.5 text-ink">
                  <Icon size={20} strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold text-ink">{card.title}</h3>
                <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-ink-soft">
                  {t(card.metaKey)}
                </p>
                <a
                  href={card.href}
                  target={card.external ? '_blank' : undefined}
                  rel={card.external ? 'noreferrer' : undefined}
                  className={`mt-3 w-full ${isDetected ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {card.external ? (
                    <ArrowRight size={14} strokeWidth={2} />
                  ) : (
                    <Download size={14} strokeWidth={2} />
                  )}
                  {t(card.labelKey)}
                  {card.version ? <span className="ml-1 opacity-70">{card.version}</span> : null}
                </a>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">{t('dl.foot')}</p>
      </div>
    </section>
  );
}
