import { motion, useReducedMotion } from 'motion/react';
import Layout from '../components/Layout';
import Section, { SectionHeading } from '../components/Section';
import FeatureCard from '../components/FeatureCard';

const MOBILE_ASSETS_BASE =
  'https://github.com/Code-MonkeyZhang/persona-agent-mobile/raw/main/assets';

const FEATURES = [
  {
    title: 'Agent Avatar Mode',
    description:
      'Full-screen character portraits and backgrounds. The AI changes expressions based on the conversation, with high-quality text-to-speech narration that feels like the agent is right beside you.',
    media: `${MOBILE_ASSETS_BASE}/mobile-agent.gif`,
    alt: 'Persona Mobile showing a full-screen character portrait that changes expressions as the conversation unfolds',
  },
  {
    title: 'Full Agent Configuration',
    description:
      'Inspect every agent configured on your desktop — model selection, system prompt, bound MCP servers, and available Skills. Switch with a tap to instantly change conversation style.',
    media: `${MOBILE_ASSETS_BASE}/agent-detail.gif`,
    alt: 'Persona Mobile browsing an agent\u2019s detail page including model, system prompt, MCP servers and Skills',
    reverse: true,
  },
  {
    title: 'Always Within Reach',
    description:
      'A single Cloudflare Tunnel URL connects you to your home or office Persona Agent from anywhere — business trips, commutes, coffee shops. Persona Mobile surfaces MCP server status and Skills at a glance, so you always know what your agents can actually do.',
    media: `${MOBILE_ASSETS_BASE}/normal-conversation.gif`,
    alt: 'Persona Mobile streaming a chat conversation with an agent while connected through a Cloudflare Tunnel',
  },
];

export default function Home() {
  const reduce = useReducedMotion();

  return (
    <Layout>
      <section className="border-b border-paper-line">
        <div className="container-wide py-20 sm:py-28">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="mb-5 text-xs font-medium uppercase tracking-widest text-ink-faint"
          >
            Persona Agent · Mobile
          </motion.p>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.05 }}
            className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-6xl"
          >
            Your AI Agent, in your palm.
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
            className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft"
          >
            Persona Mobile is a remote client for the Persona Agent desktop app. Connect via
            Cloudflare Tunnel, no sign-up required — every agent, skill, and tool configured on
            your desktop is now within reach.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.15 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <span className="btn-primary cursor-default select-none opacity-60">
              Coming soon to the App Store
            </span>
            <a
              href="https://github.com/Code-MonkeyZhang/persona-agent"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              View on GitHub →
            </a>
          </motion.div>
        </div>
      </section>

      <Section eyebrow="Features" title="The complete AI Agent experience, extended to your phone.">
        <div className="divide-y divide-paper-line">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </Section>

      <section className="border-t border-paper-line bg-paper-tint">
        <div className="container-wide py-20">
          <SectionHeading
            eyebrow="Requirements"
            title="Built to pair with the Persona Agent desktop app."
          />
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="card">
              <h3 className="text-base font-semibold text-ink">1. Install the desktop app</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Available for macOS and Windows from the GitHub releases page.
              </p>
            </div>
            <div className="card">
              <h3 className="text-base font-semibold text-ink">2. Open a Cloudflare Tunnel</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                One click in the desktop settings creates a public URL that points to your local
                server.
              </p>
            </div>
            <div className="card">
              <h3 className="text-base font-semibold text-ink">3. Paste the URL on your phone</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Open Persona Mobile, paste the tunnel URL, tap connect. Your agents are waiting.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-paper-line">
        <div className="container-wide flex flex-col items-start gap-6 py-20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Open source. Self-hosted. Yours.
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft">
              The Persona Agent desktop app and Persona Mobile are both MIT licensed. Inspect every
              line, run it on your own hardware, make it yours.
            </p>
          </div>
          <a
            href="https://github.com/Code-MonkeyZhang/persona-agent"
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            Read the source →
          </a>
        </div>
      </section>
    </Layout>
  );
}
