import { useState } from 'react';
import { useLocale } from '../../i18n';
import { DemoWindow, PHONE_BG } from './chrome';

type CapsTab = 'tools' | 'skills' | 'phone';

type StatusKey = 'cap.fsSt' | 'cap.wtSt' | 'cap.ppSt' | 'cap.appSt';
type TypeKey = 'cap.typeMcp' | 'cap.typeApp';

type ToolEntry = {
  id: string;
  icon: string;
  name: string;
  mono: boolean;
  statusKey: StatusKey;
  dot: 'green' | 'amber' | 'off';
  typeKey: TypeKey;
  url?: string;
  fns?: string[];
};

const TOOLS: ToolEntry[] = [
  {
    id: 'filesystem',
    icon: '🗂️',
    name: 'filesystem',
    mono: true,
    statusKey: 'cap.fsSt',
    dot: 'green',
    typeKey: 'cap.typeMcp',
    url: 'http://127.0.0.1:3001/sse',
    fns: ['read_file', 'write_file', 'list_dir', 'move_file'],
  },
  {
    id: 'weather',
    icon: '☁️',
    name: 'weather',
    mono: true,
    statusKey: 'cap.wtSt',
    dot: 'green',
    typeKey: 'cap.typeMcp',
    url: 'http://127.0.0.1:3002/sse',
    fns: ['get_weather', 'get_forecast', 'get_alerts'],
  },
  {
    id: 'puppeteer',
    icon: '🌐',
    name: 'puppeteer',
    mono: true,
    statusKey: 'cap.ppSt',
    dot: 'off',
    typeKey: 'cap.typeMcp',
    url: 'http://127.0.0.1:3003/sse',
    fns: ['navigate', 'click', 'screenshot', 'fill'],
  },
  {
    id: 'adventure',
    icon: '🎮',
    name: '',
    mono: false,
    statusKey: 'cap.appSt',
    dot: 'amber',
    typeKey: 'cap.typeApp',
  },
];

const DOT_CLASS = {
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  off: 'bg-neutral-300',
} as const;

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

/** One row of the tool list, leading icon box, two text lines, and the assign toggle. */
function ToolRow({
  tool,
  label,
  assigned,
  selected,
  onSelect,
  onToggle,
}: {
  tool: ToolEntry;
  label: string;
  assigned: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const { t } = useLocale();
  return (
    <div
      className={`flex cursor-pointer items-center gap-2.5 rounded-[9px] border px-2 py-1.5 transition-colors ${
        selected
          ? 'border-demo-border bg-[#f6f4f0] shadow-[inset_2.5px_0_0_#2c7fdd]'
          : 'border-transparent hover:bg-[#faf8f4]'
      }`}
      onClick={onSelect}
    >
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-[#eef0ee] text-[14px]">
        {tool.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[12.5px] font-semibold text-demo-fg ${tool.mono ? 'font-mono' : ''}`}
        >
          {tool.mono ? tool.name : label}
        </span>
        <span className="mt-px flex items-center gap-1.5 text-[10.5px] text-demo-muted-fg">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[tool.dot]}`} />
          {t(tool.statusKey)}
        </span>
      </span>
      <button
        type="button"
        aria-label={t(assigned ? 'cap.unassignAria' : 'cap.assignAria')}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[12px] leading-none transition-colors ${
          assigned
            ? 'border-demo-border bg-white text-demo-muted-fg'
            : 'border-demo-primary/35 bg-white text-demo-primary'
        }`}
      >
        {assigned ? '−' : '+'}
      </button>
    </div>
  );
}

/**
 * Static replica of the capability center. The tools tab mirrors the real
 * tools page with assigned and unassigned groups feeding a shared detail
 * panel, while skills and pocket phone tabs keep their card grids.
 */
export default function CapsStage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<CapsTab>('tools');
  const [app, setApp] = useState<AppId>('calc');
  const [skillOn, setSkillOn] = useState([true, true, false, false]);
  const [assigned, setAssigned] = useState<string[]>(['filesystem', 'weather']);
  const [selected, setSelected] = useState('filesystem');

  const tabs: Array<[CapsTab, string]> = [
    ['tools', t('cap.tabTools')],
    ['skills', t('cap.tabSkills')],
    ['phone', t('cap.tabPhone')],
  ];

  const current = TOOLS.find((tool) => tool.id === selected) ?? TOOLS[0];
  const isAssigned = (id: string) => assigned.includes(id);
  const toggle = (id: string) =>
    setAssigned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
          <div className="flex h-[430px] overflow-hidden rounded-xl border border-demo-border">
            <div className="flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-demo-border p-2.5">
              <p className="mb-0.5 mt-1 px-2 text-[10.5px] font-bold uppercase tracking-wider text-demo-muted-fg/70">
                {t('cap.grpAssigned')}
              </p>
              {TOOLS.filter((tool) => isAssigned(tool.id)).map((tool) => (
                <ToolRow
                  key={tool.id}
                  tool={tool}
                  label={t('cap.appRowN')}
                  assigned
                  selected={selected === tool.id}
                  onSelect={() => setSelected(tool.id)}
                  onToggle={() => toggle(tool.id)}
                />
              ))}
              <p className="mb-0.5 mt-2.5 px-2 text-[10.5px] font-bold uppercase tracking-wider text-demo-muted-fg/70">
                {t('cap.grpPool')}
              </p>
              {TOOLS.filter((tool) => !isAssigned(tool.id)).map((tool) => (
                <ToolRow
                  key={tool.id}
                  tool={tool}
                  label={t('cap.appRowN')}
                  assigned={false}
                  selected={selected === tool.id}
                  onSelect={() => setSelected(tool.id)}
                  onToggle={() => toggle(tool.id)}
                />
              ))}
            </div>

            <div className="min-w-0 flex-1 p-4">
              <div className="flex items-center gap-2.5 border-b border-demo-border pb-3">
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-[#eef0ee] text-[17px]">
                  {current.icon}
                </span>
                <div className="min-w-0">
                  <p
                    className={`truncate text-[15px] font-bold text-demo-fg ${current.mono ? 'font-mono' : ''}`}
                  >
                    {current.mono ? current.name : t('cap.appRowN')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-demo-muted-fg">{t(current.typeKey)}</p>
                </div>
              </div>

              <div className="flex gap-3.5 border-b border-[#f0ede6] py-3">
                <span className="w-[72px] shrink-0 text-[12px] text-demo-muted-fg">
                  {t('cap.fieldStatus')}
                </span>
                <span className="flex items-center gap-2 text-[12.5px] text-demo-fg">
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[current.dot]}`} />
                  {t(current.dot === 'off' ? 'cap.stOff' : 'cap.stConnected')}
                </span>
              </div>

              {current.url ? (
                <div className="flex gap-3.5 border-b border-[#f0ede6] py-3">
                  <span className="w-[72px] shrink-0 text-[12px] text-demo-muted-fg">
                    {t('cap.fieldUrl')}
                  </span>
                  <span className="min-w-0 truncate font-mono text-[11.5px] text-demo-fg/80">
                    {current.url}
                  </span>
                </div>
              ) : null}

              {current.fns ? (
                <div className="flex gap-3.5 border-b border-[#f0ede6] py-3">
                  <span className="w-[72px] shrink-0 pt-0.5 text-[12px] text-demo-muted-fg">
                    {t('cap.fieldFns')}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {current.fns.map((fn) => (
                      <span
                        key={fn}
                        className="rounded-md border border-demo-border bg-[#f6f4f0] px-2 py-0.5 font-mono text-[11px] text-demo-fg/80"
                      >
                        {fn}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}

              <div className="mt-3.5 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-demo-border bg-white px-3.5 py-1.5 text-[12px] text-demo-muted-fg transition-colors hover:border-neutral-300"
                >
                  {t('cap.reconnect')}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-white px-3.5 py-1.5 text-[12px] text-red-500 transition-colors hover:border-red-300"
                >
                  {t('cap.uninstall')}
                </button>
              </div>
            </div>
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
