import { useState } from 'react';
import { useLocale } from '../../i18n';
import { DemoWindow } from './chrome';
import aronaAvatar from '../../assets/demo/arona-avatar.png';

const SKILL_KEYS = ['ed.skill1', 'ed.skill2', 'ed.skill3', 'ed.skill4'] as const;

/** Static replica of the agent editor, all controls answer to direct clicks only. */
export default function EditorStage() {
  const { t } = useLocale();
  const [skills, setSkills] = useState([true, true, false, false]);
  const [temp, setTemp] = useState(40);

  return (
    <DemoWindow title={t('ed.winTitle')}>
      <div className="flex flex-col gap-3.5 p-5">
        <div className="grid grid-cols-[92px_1fr] items-center gap-3">
          <span className="text-[12px] font-semibold text-demo-muted-fg">{t('ed.pose')}</span>
          <div className="flex items-center gap-2.5 rounded-lg border border-demo-border px-3 py-2">
            <img src={aronaAvatar} alt="" className="h-[26px] w-[26px] rounded-lg object-cover" />
            <span className="text-[12.5px] font-semibold text-demo-fg">{t('ed.n1')}</span>
            <span className="ml-auto text-[11px] text-demo-muted-fg">{t('ed.applied')}</span>
          </div>
        </div>

        <div className="grid grid-cols-[92px_1fr] items-center gap-3">
          <span className="text-[12px] font-semibold text-demo-muted-fg">{t('ed.model')}</span>
          <div className="flex items-center rounded-lg border border-demo-border px-3 py-2 text-[12.5px] text-demo-fg">
            GLM-4.7
            <span className="ml-auto text-[11px] text-demo-muted-fg">{t('ed.modelDim')}</span>
          </div>
        </div>

        <div className="grid grid-cols-[92px_1fr] items-center gap-3">
          <span className="text-[12px] font-semibold text-demo-muted-fg">{t('ed.temp')}</span>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={0}
              max={100}
              value={temp}
              onChange={(event) => setTemp(Number(event.target.value))}
              className="h-1 w-full accent-demo-primary"
              aria-label={t('ed.temp')}
            />
            <span className="w-9 shrink-0 text-right text-[11.5px] font-bold text-demo-primary">
              {(temp / 100).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[92px_1fr] items-start gap-3">
          <span className="mt-1.5 text-[12px] font-semibold text-demo-muted-fg">
            {t('ed.prompt')}
          </span>
          <div className="whitespace-pre-line rounded-lg border border-demo-border bg-[#fbfaf8] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-neutral-600">
            {t('ed.promptVal')}
          </div>
        </div>

        <div className="grid grid-cols-[92px_1fr] items-start gap-3">
          <span className="mt-1 text-[12px] font-semibold text-demo-muted-fg">{t('ed.skills')}</span>
          <div className="flex flex-wrap gap-2">
            {SKILL_KEYS.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => setSkills((prev) => prev.map((on, i) => (i === index ? !on : on)))}
                className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                  skills[index]
                    ? 'border-demo-primary/50 bg-demo-primary/10 text-demo-primary'
                    : 'border-demo-border bg-white text-demo-muted-fg hover:border-neutral-300'
                }`}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="w-fit rounded-full bg-ink px-5 py-2 text-[12.5px] font-semibold text-paper transition-transform duration-150 active:scale-95"
        >
          {t('ed.save')}
        </button>
      </div>
    </DemoWindow>
  );
}
