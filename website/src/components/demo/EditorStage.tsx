import { useState } from 'react';
import { useLocale } from '../../i18n';
import { DemoWindow } from './chrome';
import aronaBg from '../../assets/demo/arona-bg.jpg';
import aronaPoseDefault from '../../assets/demo/arona-pose.png';
import aronaPoseHappy from '../../assets/demo/arona-pose-happy.png';
import aronaPoseLike from '../../assets/demo/arona-pose-like.png';

const POSES = [aronaPoseDefault, aronaPoseHappy, aronaPoseLike];

const VOICE_KEYS = ['ed.vNone', 'ed.vFemale', 'ed.vMale', 'ed.vClone'] as const;

/** Field row of one editor card, label column plus value slot. */
function Field({
  label,
  children,
  top = false,
}: {
  label: string;
  children: React.ReactNode;
  top?: boolean;
}) {
  return (
    <div className="grid grid-cols-[68px_1fr] items-start gap-2.5 py-1">
      <span className={`text-[12px] text-demo-muted-fg ${top ? 'pt-1.5' : 'pt-0.5'}`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** One titled card of the editor form. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-demo-border bg-[#fbfaf8] px-3 py-2.5">
      <h3 className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-demo-muted-fg">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Static replica of the agent editor. Field cards mirror the real editor
 * and pose plus voice controls answer to direct clicks.
 */
export default function EditorStage() {
  const { t } = useLocale();
  const [pose, setPose] = useState(0);
  const [voice, setVoice] = useState(1);

  return (
    <DemoWindow title={t('ed.winTitle')}>
      <div className="flex flex-col gap-2.5 p-4">
        <Card title={t('ed.basic')}>
          <Field label={t('ed.name')}>
            <span className="block rounded-lg border border-demo-border bg-white px-2.5 py-1.5 text-[12.5px] text-demo-fg">
              {t('ed.n1')}
            </span>
          </Field>
          <Field label={t('ed.desc')}>
            <span className="block truncate rounded-lg border border-demo-border bg-white px-2.5 py-1.5 text-[12.5px] text-demo-muted-fg">
              {t('ed.descVal')}
            </span>
          </Field>
        </Card>

        <Card title={t('ed.appearance')}>
          <Field label={t('ed.pose')}>
            <div className="flex items-center gap-2">
              {POSES.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setPose(index)}
                  aria-label={t('ed.pose')}
                  className={`h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg border bg-white transition-colors ${
                    pose === index
                      ? 'border-demo-primary ring-1 ring-demo-primary/35'
                      : 'border-demo-border hover:border-neutral-300'
                  }`}
                >
                  <img src={src} alt="" className="h-full w-full object-contain object-bottom" />
                </button>
              ))}
              <span className="ml-auto shrink-0 rounded-full bg-demo-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-demo-primary">
                {t('ed.applied')}
              </span>
            </div>
          </Field>
          <div className="mt-1.5" />
          <Field label={t('ed.bg')}>
            <div className="flex items-center gap-2">
              <span className="h-[40px] w-[72px] shrink-0 overflow-hidden rounded-lg border border-demo-border">
                <img src={aronaBg} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="rounded-full bg-demo-muted px-2 py-0.5 text-[10.5px] font-semibold text-demo-muted-fg">
                {t('ed.change')}
              </span>
            </div>
          </Field>
        </Card>

        <Card title={t('ed.modelCard')}>
          <Field label={t('ed.model')}>
            <span className="flex items-center justify-between rounded-lg border border-demo-border bg-white px-2.5 py-1.5 text-[12.5px] text-demo-fg">
              GLM-4.7
              <span className="text-[11px] text-demo-muted-fg">{t('ed.modelDim')}</span>
            </span>
          </Field>
          <div className="mt-1" />
          <Field label={t('ed.prompt')} top>
            <p className="h-[58px] overflow-hidden whitespace-pre-line rounded-lg border border-demo-border bg-white px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-neutral-600">
              {t('ed.promptVal')}
            </p>
          </Field>
        </Card>

        <Card title={t('ed.voiceCard')}>
          <div className="flex items-center gap-1.5 py-1">
            {VOICE_KEYS.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => setVoice(index)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                  voice === index
                    ? 'border-demo-primary/35 bg-demo-primary/10 text-demo-primary'
                    : 'border-demo-border bg-white text-demo-muted-fg hover:border-neutral-300'
                }`}
              >
                {t(key)}
              </button>
            ))}
            <span className="ml-auto shrink-0 text-[11px] text-demo-muted-fg">
              🔈 {t('ed.listen')}
            </span>
          </div>
        </Card>
      </div>
    </DemoWindow>
  );
}
