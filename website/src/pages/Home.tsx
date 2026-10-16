import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import Layout from '../components/Layout';
import DownloadSection from '../components/DownloadSection';
import { SectionHead } from '../components/demo/chrome';
import HeroStage from '../components/demo/HeroStage';
import EditorStage from '../components/demo/EditorStage';
import CapsStage from '../components/demo/CapsStage';
import MobileMock from '../components/demo/MobileMock';
import MarketStage from '../components/demo/MarketStage';
import { useLocale } from '../i18n';
import { useLatestReleases, detectPlatform, DESKTOP_RELEASES_URL } from '../lib/releases';

function HeroPrimaryButton() {
  const { t } = useLocale();
  const releases = useLatestReleases();

  switch (detectPlatform()) {
    case 'win':
      return (
        <a href={releases.desktopAssets.win ?? DESKTOP_RELEASES_URL} className="btn-primary">
          {t('hero.downloadWin')}
        </a>
      );
    case 'ios':
    case 'android':
      return (
        <a href="#download" className="btn-primary">
          {t('hero.allPlatforms')}
        </a>
      );
    default:
      return (
        <a href={releases.desktopAssets.macArm ?? DESKTOP_RELEASES_URL} className="btn-primary">
          {t('hero.downloadMac')}
        </a>
      );
  }
}

function HeroProps() {
  const { t } = useLocale();
  const props = ['hero.free', 'hero.prop2', 'hero.prop3'] as const;
  return (
    <div className="mt-8 flex flex-col gap-3">
      {props.map((key) => (
        <div key={key} className="flex items-center gap-2.5 text-sm font-medium text-ink-soft">
          <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-ink text-paper">
            <Check size={10} strokeWidth={3.4} />
          </span>
          {t(key)}
        </div>
      ))}
    </div>
  );
}

function ProviderSection() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const chips = t('eco.chips')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return (
    <section className="border-t border-paper-line bg-paper-tint py-16">
      <div className="container-wide">
        <SectionHead eyebrow={t('eco.eyebrow')} title={t('eco.title')} sub={t('eco.sub')} />

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1], delay: 0.05 }}
          className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2.5"
        >
          {chips.map((name) => (
            <span
              key={name}
              className="rounded-full border border-paper-line bg-paper px-4 py-2 text-sm font-medium text-ink-soft"
            >
              {name}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function OpenSourceSection() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const repos = [
    {
      href: 'https://github.com/Code-MonkeyZhang/persona-agent',
      path: 'Code-MonkeyZhang / persona-agent',
      titleKey: 'oss.c1t' as const,
      descKey: 'oss.c1d' as const,
    },
    {
      href: 'https://github.com/Code-MonkeyZhang/persona-agent-mobile',
      path: 'Code-MonkeyZhang / persona-agent-mobile',
      titleKey: 'oss.c2t' as const,
      descKey: 'oss.c2d' as const,
    },
    {
      href: 'https://github.com/Code-MonkeyZhang/persona-agent-marketplace',
      path: 'Code-MonkeyZhang / persona-agent-marketplace',
      titleKey: 'oss.c3t' as const,
      descKey: 'oss.c3d' as const,
    },
  ];
  return (
    <section className="bg-ink py-16 text-paper">
      <div className="container-wide">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="mx-auto max-w-xl text-center"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-paper/50">
            {t('oss.eyebrow')}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
            {t('oss.title')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-paper/70">{t('oss.sub')}</p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {repos.map((repo) => (
            <motion.a
              key={repo.href}
              href={repo.href}
              target="_blank"
              rel="noreferrer"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="block rounded-2xl border border-paper/20 p-5 transition-colors duration-150 hover:border-paper/50"
            >
              <p className="font-mono text-xs text-paper/60">{repo.path}</p>
              <h3 className="mt-2 text-base font-semibold text-paper">{t(repo.titleKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/75">{t(repo.descKey)}</p>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const detectedPlatform = detectPlatform();

  return (
    <Layout>
      <section className="border-b border-paper-line">
        <div className="container-wide grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
          <div>
            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.05 }}
              className="max-w-xl text-4xl font-bold leading-[1.15] tracking-tight text-ink sm:text-5xl"
            >
              {t('hero.title')}
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
              className="mt-6 max-w-md text-base leading-relaxed text-ink-soft sm:text-lg"
            >
              {t('hero.sub')}
            </motion.p>

            {detectedPlatform === 'mac' || detectedPlatform === 'win' ? (
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.12 }}
                className="mt-6 text-xs font-medium text-ink-faint"
              >
                {t('dl.detected')}
              </motion.p>
            ) : null}

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.15 }}
              className="mt-3 flex flex-wrap items-center gap-3"
            >
              <HeroPrimaryButton />
              <a href="#download" className="btn-ghost">
                {t('hero.allPlatforms')}
              </a>
            </motion.div>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.2 }}
            >
              <HeroProps />
            </motion.div>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1], delay: 0.25 }}
            className="min-w-0"
          >
            <HeroStage />
          </motion.div>
        </div>
      </section>

      <section id="editor" className="scroll-mt-16 border-t border-paper-line bg-paper-tint py-16">
        <div className="container-wide grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
          <EditorStage />
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink-faint">
              {t('ed.eyebrow')}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {t('ed.title')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">{t('ed.sub')}</p>
          </div>
        </div>
      </section>

      <section id="capabilities" className="scroll-mt-16 border-t border-paper-line py-16">
        <div className="container-wide grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink-faint">
              {t('cap.eyebrow')}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {t('cap.title')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">{t('cap.sub')}</p>
          </div>
          <CapsStage />
        </div>
      </section>

      <section id="mobile" className="scroll-mt-16 border-t border-paper-line bg-paper-tint py-16">
        <div className="container-wide">
          <SectionHead eyebrow={t('tun.eyebrow')} title={t('tun.title')} sub={t('tun.sub')} />
          <div className="mt-12">
            <MobileMock />
          </div>        </div>
      </section>

      <section id="marketplace" className="scroll-mt-16 border-t border-paper-line py-16">
        <div className="container-wide">
          <SectionHead
            eyebrow={t('market.eyebrow')}
            title={t('market.title')}
            sub={t('market.sub')}
          />
          <div className="mt-10">
            <MarketStage />
          </div>
        </div>
      </section>

      <ProviderSection />
      <DownloadSection />
      <OpenSourceSection />
    </Layout>
  );
}
