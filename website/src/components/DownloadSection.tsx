import type { ReactNode } from 'react';
import { Download, ArrowRight } from 'lucide-react';
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

type CardId = 'mac' | 'win' | 'ios' | 'android';

type CardButton = {
  href: string;
  label: string;
  external?: boolean;
};

function detectedCardOf(platform: Platform): CardId | null {
  switch (platform) {
    case 'mac':
      return 'mac';
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

function AppleLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0 text-ink"
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function WindowsLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0 text-ink"
    >
      <path d="M2.4 3.9 11 2.7v8.1H2.4V3.9zM2.4 20.1 11 21.3v-8.1H2.4v6.9zM12.4 2.5 22 1.1v9.7h-9.6V2.5zM12.4 13.2H22V23l-9.6-1.4v-8.4z" />
    </svg>
  );
}

function AndroidLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0 text-ink"
    >
      <path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.104 12.104 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z" />
    </svg>
  );
}

function CardAction({
  button,
  isDetected,
}: {
  button: CardButton;
  isDetected: boolean;
}) {
  return (
    <a
      href={button.href}
      target={button.external ? '_blank' : undefined}
      rel={button.external ? 'noreferrer' : undefined}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-transform duration-150 active:scale-[0.97] ${
        isDetected ? 'border-ink bg-ink text-paper' : 'border-paper-line text-ink'
      }`}
    >
      {button.external ? (
        <ArrowRight size={13} strokeWidth={2.4} />
      ) : (
        <Download size={13} strokeWidth={2.4} />
      )}
      {button.label}
    </a>
  );
}

export default function DownloadSection() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const releases = useLatestReleases();
  const detected = detectedCardOf(detectPlatform());

  const cards: Array<{
    id: CardId;
    icon: ReactNode;
    title: string;
    version?: string | null;
    buttons: CardButton[];
  }> = [
    {
      id: 'mac',
      icon: <AppleLogo />,
      title: 'macOS',
      version: releases.desktopVersion,
      buttons: [
        {
          href: releases.desktopAssets.macArm ?? releases.desktopAssets.macX64 ?? DESKTOP_RELEASES_URL,
          label: t('dl.btn'),
        },
      ],
    },
    {
      id: 'win',
      icon: <WindowsLogo />,
      title: 'Windows',
      version: releases.desktopVersion,
      buttons: [{ href: releases.desktopAssets.win ?? DESKTOP_RELEASES_URL, label: t('dl.btn') }],
    },
    {
      id: 'ios',
      icon: <AppleLogo />,
      title: 'iOS',
      buttons: [{ href: APP_STORE_URL, label: t('dl.btnIos'), external: true }],
    },
    {
      id: 'android',
      icon: <AndroidLogo />,
      title: 'Android',
      version: releases.androidVersion,
      buttons: [{ href: releases.androidApk ?? MOBILE_RELEASES_URL, label: t('dl.btnAndroid') }],
    },
  ];

  return (
    <section id="download" className="scroll-mt-16 border-t border-paper-line py-16">
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
        </motion.div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((card) => {
            const isDetected = card.id === detected;
            return (
              <motion.div
                key={card.id}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className={`relative flex flex-col rounded-2xl border bg-paper p-4 ${
                  isDetected
                    ? 'border-ink shadow-[0_16px_32px_-20px_rgba(10,10,10,0.3)]'
                    : 'border-paper-line'
                }`}
              >
                {isDetected && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-paper">
                    {t('dl.detected')}
                  </span>
                )}
                <div className="flex items-center gap-2 text-ink">
                  {card.icon}
                  <h3 className="text-sm font-semibold text-ink">
                    {card.title}
                    {card.version ? (
                      <span className="ml-1.5 text-[11px] font-normal text-ink-faint">
                        {card.version}
                      </span>
                    ) : null}
                  </h3>
                </div>
                <div className="mt-3 flex gap-2">
                  {card.buttons.map((button) => (
                    <CardAction key={button.label} button={button} isDetected={isDetected} />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">{t('dl.foot')}</p>
      </div>
    </section>
  );
}
