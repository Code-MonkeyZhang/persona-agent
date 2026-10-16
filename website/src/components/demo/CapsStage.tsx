import { useState } from 'react';
import { useLocale } from '../../i18n';
import { DemoWindow, PHONE_BG } from './chrome';

type CapsTab = 'tools' | 'skills' | 'phone';

const TOOLS = [
  { name: 'filesystem', descKey: 'cap.t1d', connected: true, countKey: 'cap.t1c' },
  { name: 'puppeteer', descKey: 'cap.t2d', connected: true, countKey: 'cap.t2c' },
  { name: 'weather', descKey: 'cap.t3d', connected: false, countKey: 'cap.t3c' },
] as const;

const SKILLS = [
  { icon: '🌤️', nameKey: 'cap.s1n', descKey: 'cap.s1d' },
  { icon: '🌐', nameKey: 'cap.s2n', descKey: 'cap.s2d' },
  { icon: '🍅', nameKey: 'cap.s3n', descKey: 'cap.s3d' },
  { icon: '🧠', nameKey: 'cap.s4n', descKey: 'cap.s4d' },
] as const;

const APPS = [
  { id: 'calc', icon: '🧮', nameKey: 'cap.a1n', descKey: 'cap.a1d' },
  { id: 'piano', icon: '🎹', nameKey: 'cap.a2n', descKey: 'cap.a2d' },
  { id: 'map', icon: '🗺️', nameKey: 'cap.a3n', descKey: 'cap.a3d' },
] as const;

type AppId = (typeof APPS)[number]['id'];

/** Screen content of a pocket phone app, drawn with plain shapes. */
function AppScreen({ id }: { id: AppId }) {
  if (id === 'calc') {
    return (
      <div className="grid h-full grid-cols-4 content-end gap-1.5 p-2.5">
        {Array.from({ length: 12 }).map((_, index) => (
          <span
            key={index}
            className="h-6 rounded-lg"
            style={{ backgroundColor: (index + 1) % 4 === 0 ? '#2c7fdd' : '#f0eeea' }}
          />
        ))}
      </div>
    );
  }
  if (id === 'piano') {
    return (
      <div className="flex h-full items-end gap-1 px-2.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <span
            key={index}
            className={`flex-1 rounded-b-md ${index % 2 === 0 ? 'h-[78%] bg-neutral-800' : 'h-[58%] border border-demo-border bg-white'}`}
          />
        ))}
      </div>
    );
  }
  return (
    <svg viewBox="0 0 150 260" className="h-full w-full">
      <path
        d="M30 220 C 30 160, 60 150, 60 110 S 110 80, 118 40"
        fill="none"
        stroke="#c9c4b8"
        strokeWidth="2.5"
        strokeDasharray="6 5"
        strokeLinecap="round"
      />
      <circle cx="30" cy="220" r="7" fill="#2c7fdd" />
      <circle cx="118" cy="40" r="7" fill="#1c1b18" />
      <circle cx="60" cy="110" r="5" fill="#fff" stroke="#c9c4b8" strokeWidth="2" />
    </svg>
  );
}

/** Static replica of the capability center, tabs answer to direct clicks only. */
export default function CapsStage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<CapsTab>('tools');
  const [app, setApp] = useState<AppId>('calc');
  const [skillOn, setSkillOn] = useState([true, true, false, false]);

  const tabs: Array<[CapsTab, string]> = [
    ['tools', t('cap.tabTools')],
    ['skills', t('cap.tabSkills')],
    ['phone', t('cap.tabPhone')],
  ];

  return (
    <DemoWindow title={t('cap.winTitle')}>
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                tab === id
                  ? 'border-ink bg-ink text-paper'
                  : 'border-demo-border bg-white text-demo-muted-fg hover:border-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'tools' ? (
          <div className="grid gap-2.5">
            {TOOLS.map((tool) => (
              <div key={tool.name} className="flex items-center gap-3 rounded-xl border border-demo-border bg-white px-4 py-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${tool.connected ? 'bg-green-500' : 'bg-neutral-300'}`} />
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-semibold text-demo-fg">{tool.name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-demo-muted-fg">{t(tool.descKey)}</p>
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                    tool.connected ? 'bg-green-100 text-green-600' : 'bg-demo-muted text-neutral-400'
                  }`}
                >
                  {t(tool.countKey)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'skills' ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {SKILLS.map((skill, index) => (
              <div key={skill.nameKey} className="flex items-center gap-3 rounded-xl border border-demo-border bg-white p-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-demo-muted text-[15px]">
                  {skill.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-demo-fg">{t(skill.nameKey)}</p>
                  <p className="mt-0.5 text-[10.5px] text-demo-muted-fg">{t(skill.descKey)}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={skillOn[index]}
                  onClick={() => setSkillOn((prev) => prev.map((on, i) => (i === index ? !on : on)))}
                  className={`ml-auto h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                    skillOn[index] ? 'bg-demo-primary' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className="block h-4 w-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ margin: '2px', marginLeft: skillOn[index] ? '18px' : '2px' }}
                  />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'phone' ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch">
            <div className="grid flex-1 content-start gap-2">
              {APPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setApp(item.id)}
                  className={`flex items-center gap-3 rounded-xl border-2 bg-white px-3.5 py-2.5 text-left transition-colors ${
                    app === item.id ? 'border-demo-primary bg-demo-primary/5' : 'border-demo-border hover:border-neutral-300'
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-demo-muted text-[15px]">
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-demo-fg">{t(item.nameKey)}</span>
                    <span className="mt-0.5 block text-[10.5px] text-demo-muted-fg">{t(item.descKey)}</span>
                  </span>
                  <span
                    className={`ml-auto shrink-0 text-[10px] font-bold text-demo-primary transition-opacity ${
                      app === item.id ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {t('cap.running')} ▸
                  </span>
                </button>
              ))}
            </div>
            <div className="mx-auto w-[172px] shrink-0 rounded-[26px] bg-ink p-2 shadow-[0_16px_32px_-18px_rgba(10,10,10,0.5),inset_0_0_0_1.5px_#3a382f]">
              <div className="flex h-[300px] flex-col overflow-hidden rounded-[20px]" style={{ background: PHONE_BG }}>
                <div className="flex items-center justify-between px-3 pb-1 pt-3 text-[10px] font-bold text-neutral-700">
                  <span>9:41</span>
                  <span className="mx-auto h-3 w-11 rounded-full bg-ink" />
                  <span>🔋</span>
                </div>
                <div className="flex-1 p-2">
                  <div
                    key={app}
                    className="h-full overflow-hidden rounded-xl border border-white/60 bg-white/70 transition-opacity duration-300"
                  >
                    <AppScreen id={app} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DemoWindow>
  );
}
