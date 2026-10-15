import { motion, useReducedMotion } from 'motion/react';
import { ShieldCheck, BrainCircuit, Plug, MessageCircle, Sparkles, AppWindow, VenetianMask, Cloud, Smartphone } from 'lucide-react';
import Layout from '../components/Layout';
import Section from '../components/Section';
import FeatureCard from '../components/FeatureCard';
import DownloadSection from '../components/DownloadSection';
import { useLocale } from '../i18n';
import {
  useLatestReleases,
  detectPlatform,
  DESKTOP_RELEASES_URL,
} from '../lib/releases';
import chatImg from '../assets/preview-chat.jpg';
import companionImg from '../assets/preview-companion.jpg';
import editorImg from '../assets/preview-agent-editor.jpg';
import marketImg from '../assets/preview-marketplace.jpg';
import mobileImg from '../assets/mobile-hero.jpg';

function HeroPrimaryButton() {
  const { t } = useLocale();
  const releases = useLatestReleases();

  switch (detectPlatform()) {
    case 'win':
      return (
        <a href={releases.desktopAssets.win ?? DESKTOP_RELEASES_URL} className="btn-primary">
          {t('hero.downloadWin')}
          {releases.desktopVersion ? (
            <span className="ml-1 opacity-70">{releases.desktopVersion}</span>
          ) : null}
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
          {releases.desktopVersion ? (
            <span className="ml-1 opacity-70">{releases.desktopVersion}</span>
          ) : null}
        </a>
      );
  }
}

function HeroShot() {
  const { t } = useLocale();
  return (
    <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-xl border border-paper-line bg-paper shadow-[0_32px_64px_-28px_rgba(10,10,10,0.28)]">
      <div className="flex h-9 items-center gap-1.5 border-b border-paper-line bg-paper-tint px-3.5">
        <span className="h-3 w-3 rounded-full border border-black/10 bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full border border-black/10 bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full border border-black/10 bg-[#28C840]" />
      </div>
      <img src={chatImg} alt={t('alt.chat')} className="block w-full" />
    </div>
  );
}

function BadgeStrip() {
  const { t } = useLocale();
  const badges = [
    { icon: ShieldCheck, key: 'badge.local' as const },
    { icon: BrainCircuit, key: 'badge.providers' as const },
    { icon: Plug, key: 'badge.tools' as const },
    { icon: MessageCircle, key: 'badge.memory' as const },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 px-6 pb-16 pt-2">
      {badges.map(({ icon: Icon, key }) => (
        <span
          key={key}
          className="inline-flex items-center gap-2 rounded-full border border-paper-line bg-paper px-3.5 py-1.5 text-xs text-ink-soft"
        >
          <Icon size={13} strokeWidth={2} className="text-ink-faint" />
          {t(key)}
        </span>
      ))}
    </div>
  );
}

function MarketplaceSection() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const tabs = [
    { icon: VenetianMask, key: 'market.tabAgents' as const, count: '4' },
    { icon: Plug, key: 'market.tabTools' as const, count: '4' },
    { icon: Sparkles, key: 'market.tabSkills' as const, count: '5' },
    { icon: AppWindow, key: 'market.tabApps' as const, count: '3' },
  ];
  return (
    <section id="marketplace" className="scroll-mt-16 border-t border-paper-line bg-paper-tint py-16">
      <div className="container-wide">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink-faint">
            {t('market.eyebrow')}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {t('market.title')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-soft">{t('market.sub')}</p>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          className="relative mt-10 h-[380px] overflow-hidden rounded-xl border border-paper-line bg-paper shadow-[0_24px_48px_-24px_rgba(10,10,10,0.22)]"
        >
          <img
            src={marketImg}
            alt={t('alt.market')}
            loading="lazy"
            className="block h-full w-full object-cover object-top"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-paper-tint" />
        </motion.div>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          {tabs.map(({ icon: Icon, key, count }) => (
            <span
              key={key}
              className="inline-flex items-center gap-2 rounded-full border border-paper-line bg-paper px-4 py-2 text-sm text-ink-soft"
            >
              <Icon size={15} strokeWidth={2} className="text-ink-faint" />
              {t(key)}
              <b className="font-semibold text-ink">{count}</b>
            </span>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-ink-faint">{t('market.note')}</p>
      </div>
    </section>
  );
}

function MobileSection() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const steps = [
    { titleKey: 'mobile.s1t' as const, descKey: 'mobile.s1d' as const, icon: Cloud },
    { titleKey: 'mobile.s2t' as const, descKey: 'mobile.s2d' as const, icon: Smartphone },
    { titleKey: 'mobile.s3t' as const, descKey: 'mobile.s3d' as const, icon: MessageCircle },
  ];
  return (
    <section id="mobile" className="scroll-mt-16 border-t border-paper-line py-16">
      <div className="container-wide">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -24 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="mx-auto w-full max-w-[280px]"
          >
            <div className="rounded-[28px] border border-paper-line bg-paper p-2.5 shadow-[0_24px_48px_-24px_rgba(10,10,10,0.25)]">
              <div className="overflow-hidden rounded-[20px] bg-black">
                <img
                  src={mobileImg}
                  alt={t('alt.mobile')}
                  loading="lazy"
                  className="block w-full"
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, x: 24 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink-faint">
              {t('mobile.eyebrow')}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {t('mobile.title')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">{t('mobile.sub')}</p>
            <div className="mt-6 grid gap-3.5">
              {steps.map(({ titleKey, descKey, icon: Icon }, index) => (
                <div
                  key={titleKey}
                  className="flex items-start gap-3.5 rounded-xl border border-paper-line bg-paper p-4"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon size={14} strokeWidth={2} className="text-ink-faint" />
                      <h4 className="text-sm font-semibold text-ink">{t(titleKey)}</h4>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t(descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
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

  return (
    <Layout>
      <section className="border-b border-paper-line">
        <div className="container-wide py-20 text-center sm:py-24">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="mb-5 text-xs font-medium uppercase tracking-widest text-ink-faint"
          >
            {t('hero.eyebrow')}
          </motion.p>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.05 }}
            className="mx-auto max-w-3xl text-4xl font-bold leading-[1.15] tracking-tight text-ink sm:text-5xl"
          >
            {t('hero.titleA')}
            <br />
            {t('hero.titleB')}
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg"
          >
            {t('hero.sub')}
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.15 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <HeroPrimaryButton />
            <a href="#download" className="btn-ghost">
              {t('hero.allPlatforms')}
            </a>
          </motion.div>

          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-4 text-xs text-ink-faint"
          >
            {t('hero.hint')}
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1], delay: 0.2 }}
          >
            <HeroShot />
          </motion.div>
        </div>
      </section>

      <BadgeStrip />

      <Section id="features" eyebrow={t('features.eyebrow')} title={t('features.title')}>
        <p className="-mt-6 max-w-2xl text-base leading-relaxed text-ink-soft">
          {t('features.sub')}
        </p>
        <div className="divide-y divide-dashed divide-paper-line">
          <FeatureCard
            title={t('f1.title')}
            description={t('f1.sub')}
            points={[t('f1.p1'), t('f1.p2'), t('f1.p3')]}
            media={chatImg}
            alt={t('alt.chat')}
          />
          <FeatureCard
            title={t('f2.title')}
            description={t('f2.sub')}
            points={[t('f2.p1'), t('f2.p2'), t('f2.p3')]}
            media={companionImg}
            alt={t('alt.companion')}
            reverse
          />
          <FeatureCard
            title={t('f3.title')}
            description={t('f3.sub')}
            points={[t('f3.p1'), t('f3.p2'), t('f3.p3')]}
            media={editorImg}
            alt={t('alt.editor')}
          />
        </div>
      </Section>

      <MarketplaceSection />
      <MobileSection />
      <DownloadSection />
      <OpenSourceSection />
    </Layout>
  );
}
