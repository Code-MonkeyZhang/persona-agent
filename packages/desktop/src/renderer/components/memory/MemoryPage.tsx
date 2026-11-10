/**
 * @file src/renderer/components/memory/MemoryPage.tsx
 * @description 记忆管理页，第二栏在聊天与工具之间的独立入口。
 *
 * 页面是头部固定加正文滚动的单列折叠卡片流：头部放标题、新增、搜索、
 * 类型筛选与条目总数，正文是条目卡片列表。数据走 HTTP 四接口，页面
 * 本地持有列表，增删改后重新拉取，记忆只在管理页消费无跨页共享。
 * 新增走草稿表单，保存才落库，取消即丢弃不留残行。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookHeart, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { useAgentStore } from '../../stores/agentStore';
import { toast } from '../../stores/toastStore';
import type {
  MemoryEntry,
  MemoryUpdateInput,
  MemoryWriteInput,
} from '@persona/shared';
import {
  createAgentMemory,
  deleteAgentMemory,
  listAgentMemories,
  updateAgentMemory,
} from '../../lib/api';
import { MemoryCard } from './MemoryCard';

/** 类型筛选的四个档位，已停用独立于类型 */
type MemoryFilter = 'all' | 'pinned' | 'triggered' | 'disabled';

const FILTERS: { value: MemoryFilter; key: string }[] = [
  { value: 'all', key: 'memory.filterAll' },
  { value: 'pinned', key: 'memory.filterPinned' },
  { value: 'triggered', key: 'memory.filterTriggered' },
  { value: 'disabled', key: 'memory.filterDisabled' },
];

export function MemoryPage() {
  const { t } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);

  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [filter, setFilter] = useState<MemoryFilter>('all');
  const [search, setSearch] = useState('');
  /** 当前展开的条目编号，一次只编辑一条 */
  const [expandedUid, setExpandedUid] = useState<number | null>(null);
  /** 新增草稿表单是否展开 */
  const [draftOpen, setDraftOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentAgent) return;
    try {
      setEntries(await listAgentMemories(currentAgent.id));
    } catch {
      toast.error(t('memory.loadFailed'));
    }
  }, [currentAgent, t]);

  useEffect(() => {
    setEntries([]);
    setExpandedUid(null);
    setDraftOpen(false);
    void refresh();
  }, [refresh]);

  const handleCreate = async (input: MemoryWriteInput) => {
    if (!currentAgent) return;
    try {
      await createAgentMemory(currentAgent.id, input);
      await refresh();
    } catch {
      toast.error(t('memory.saveFailed'));
    }
  };

  const handleUpdate = async (uid: number, patch: MemoryUpdateInput) => {
    if (!currentAgent) return;
    try {
      await updateAgentMemory(currentAgent.id, uid, patch);
      await refresh();
    } catch {
      toast.error(t('memory.saveFailed'));
    }
  };

  const handleDelete = async (uid: number) => {
    if (!currentAgent) return;
    try {
      await deleteAgentMemory(currentAgent.id, uid);
      await refresh();
    } catch {
      toast.error(t('memory.deleteFailed'));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'pinned' && !(e.enabled && e.type === 'pinned'))
        return false;
      if (filter === 'triggered' && !(e.enabled && e.type === 'triggered'))
        return false;
      if (filter === 'disabled' && e.enabled) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.keys.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [entries, filter, search]);

  return (
    <div className="h-full flex flex-col">
      {/* 固定头部：标题、新增、搜索、筛选与总数 */}
      <div className="shrink-0 border-b border-border px-6 pt-5 pb-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookHeart className="w-5 h-5 text-foreground" />
              <h2 className="text-title-page font-semibold text-foreground">
                {t('memory.title')}
              </h2>
            </div>
            <Button size="sm" onClick={() => setDraftOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              {t('memory.add')}
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('memory.searchPlaceholder')}
              className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              {FILTERS.map(({ value, key }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-caption transition-colors',
                    filter === value
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
              {t('memory.countShort', { count: entries.length })}
            </span>
          </div>
        </div>
      </div>

      {/* 滚动正文：折叠卡片流 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
          {draftOpen && (
            <MemoryCard
              entry={null}
              open
              onOpenChange={(open) => setDraftOpen(open)}
              onCreate={handleCreate}
            />
          )}
          {filtered.map((entry) => (
            <MemoryCard
              key={entry.uid}
              entry={entry}
              open={expandedUid === entry.uid}
              onOpenChange={(open) => setExpandedUid(open ? entry.uid : null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
          {filtered.length === 0 && !draftOpen && (
            <div className="py-16 text-center text-body text-muted-foreground">
              {search.trim() ? t('memory.emptySearch') : t('memory.empty')}
            </div>
          )}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
