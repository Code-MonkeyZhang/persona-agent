import { useState } from 'react';
import { AppWindow, Check, Download, ExternalLink, Search, Sparkles, UserRound, Wrench } from 'lucide-react';
import { useLocale, type I18nKey } from '../../i18n';
import { DemoWindow } from './chrome';

type Category = 'agents' | 'tools' | 'skills' | 'apps';

/** Marketplace items, one per category tab, mirroring the demo card payload. */
const ITEMS: Array<{
  category: Category;
  icon: typeof Wrench;
  nameKey: I18nKey;
  descKey: I18nKey;
  installed?: boolean;
}> = [
  { category: 'agents', icon: UserRound, nameKey: 'mkt.p3n', descKey: 'mkt.p3d' },
  { category: 'tools', icon: Wrench, nameKey: 'mkt.p1n', descKey: 'mkt.p1d' },
  { category: 'skills', icon: Sparkles, nameKey: 'mkt.p2n', descKey: 'mkt.p2d', installed: true },
  { category: 'apps', icon: AppWindow, nameKey: 'mkt.p4n', descKey: 'mkt.p4d' },
];

const TAB_KEYS: Array<{ id: Category; key: I18nKey }> = [
  { id: 'agents', key: 'market.tabAgents' },
  { id: 'tools', key: 'market.tabTools' },
  { id: 'skills', key: 'market.tabSkills' },
  { id: 'apps', key: 'market.tabApps' },
];

/**
 * Static replica of the marketplace view.
 * Card anatomy follows the demo MarketplaceCard: logo, name with author,
 * two-line description, external link button and install button.
 */
export default function MarketStage() {
  const { t } = useLocale();
  const [category, setCategory] = useState<Category>('tools');
  const item = ITEMS.find((entry) => entry.category === category) ?? ITEMS[0];

  return (
    <DemoWindow title={t('mkt.winTitle')}>
      <div className="p-4 sm:p-5">
        <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-demo-border bg-white px-3 py-2 text-[12.5px] text-demo-placeholder">
          <Search size={15} className="shrink-0 text-demo-muted-fg" />
          {t('market.search')}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {TAB_KEYS.map(({ id, key }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                category === id
                  ? 'border-ink bg-ink text-paper'
                  : 'border-demo-border bg-white text-demo-muted-fg hover:border-neutral-300'
              }`}
            >
              {t(key)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex h-full flex-col gap-2 rounded-xl border border-demo-border bg-white px-3.5 py-3 transition-colors hover:bg-demo-muted">
            <div className="flex items-start gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-demo-muted text-demo-muted-fg">
                <item.icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-demo-fg">{t(item.nameKey)}</div>
                <div className="truncate text-[11px] text-demo-muted-fg">@Code-MonkeyZhang</div>
              </div>
            </div>
            <p className="h-[36px] text-[11px] leading-[18px] text-demo-muted-fg">{t(item.descKey)}</p>
            <div className="flex items-center gap-1.5">
              <span className="inline-grid h-7 w-7 place-items-center rounded-lg border border-demo-border bg-white text-demo-muted-fg">
                <ExternalLink size={14} />
              </span>
              <div className="flex-1" />
              {item.installed ? (
                <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-demo-muted px-2.5 text-[12px] text-demo-muted-fg">
                  <Check size={14} />
                  {t('mkt.installed')}
                </span>
              ) : (
                <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-demo-primary px-2.5 text-[12px] text-white">
                  <Download size={14} />
                  {t('mkt.install')}
                </span>
              )}
            </div>
          </div>

          {ITEMS.filter((entry) => entry.category !== category).map((entry) => (
            <div
              key={entry.category}
              className="flex h-full flex-col gap-2 rounded-xl border border-demo-border bg-white px-3.5 py-3 opacity-70 transition-colors hover:bg-demo-muted"
            >
              <div className="flex items-start gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-demo-muted text-demo-muted-fg">
                  <entry.icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-demo-fg">{t(entry.nameKey)}</div>
                  <div className="truncate text-[11px] text-demo-muted-fg">@Code-MonkeyZhang</div>
                </div>
              </div>
              <p className="h-[36px] text-[11px] leading-[18px] text-demo-muted-fg">{t(entry.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </DemoWindow>
  );
}
