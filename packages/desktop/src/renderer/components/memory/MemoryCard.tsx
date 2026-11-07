/**
 * @file src/renderer/components/memory/MemoryCard.tsx
 * @description 记忆条目的折叠卡片，参照酒馆世界书编辑器的折叠卡片流。
 *
 * 折叠头只放高频字段：启停开关、标题、类型副行；点开才编辑，类型选择在触发词
 * 上方，选常驻则触发词输入随之隐藏，全程不弹窗。展开编辑区带本地草稿，保存才
 * 落库，取消回滚。删除是两步确认，避免误触。entry 为 null 时是新增草稿形态，
 * 只渲染编辑区，保存走 onCreate。
 */
import { useEffect, useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Switch } from '../ui/Switch';
import { Button } from '../ui/Button';
import type {
  MemoryEntry,
  MemoryType,
  MemoryUpdateInput,
  MemoryWriteInput,
} from '@persona/shared';

/** 展开态草稿：标题、内容、类型与触发词四个可编辑字段 */
interface CardDraft {
  title: string;
  content: string;
  keys: string[];
  type: MemoryType;
}

/** 初始草稿：新增草稿与展开已有条目共用 */
const EMPTY_DRAFT: CardDraft = {
  title: '',
  content: '',
  keys: [],
  type: 'triggered',
};

export function MemoryCard({
  entry,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onCreate,
}: {
  /** 条目，null 表示新增草稿形态 */
  entry: MemoryEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已有条目的保存通道 */
  onUpdate?: (uid: number, patch: MemoryUpdateInput) => Promise<void>;
  /** 已有条目的删除通道 */
  onDelete?: (uid: number) => Promise<void>;
  /** 新增草稿的保存通道 */
  onCreate?: (input: MemoryWriteInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const isDraft = entry === null;

  const [draft, setDraft] = useState<CardDraft>(
    entry
      ? {
          title: entry.title,
          content: entry.content,
          keys: entry.keys,
          type: entry.type,
        }
      : { ...EMPTY_DRAFT }
  );
  const [keyInput, setKeyInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // 展开时同步一次草稿，收起不回写；条目自身被外部改动时也重新对齐
  useEffect(() => {
    if (!entry) return;
    setDraft({
      title: entry.title,
      content: entry.content,
      keys: entry.keys,
      type: entry.type,
    });
    setKeyInput('');
    setConfirmDelete(false);
  }, [
    entry?.uid,
    open,
    entry?.title,
    entry?.content,
    entry?.keys,
    entry?.type,
  ]);

  const canSave =
    !saving && draft.title.trim().length > 0 && draft.content.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    const content = draft.content.trim();
    const keys = Array.from(
      new Set(draft.keys.map((k) => k.trim()).filter(Boolean))
    );
    const title = draft.title.trim();
    setSaving(true);
    try {
      if (isDraft) {
        await onCreate?.({
          title,
          content,
          keys,
          type: draft.type,
          enabled: true,
        });
      } else if (entry) {
        await onUpdate?.(entry.uid, { title, content, keys, type: draft.type });
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!entry || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(entry.uid);
    onOpenChange(false);
  };

  const addKey = () => {
    const key = keyInput.trim();
    if (!key) return;
    if (!draft.keys.includes(key))
      setDraft((d) => ({ ...d, keys: [...d.keys, key] }));
    setKeyInput('');
  };

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        'rounded-xl border border-border bg-white overflow-hidden transition-opacity',
        entry && !entry.enabled && 'opacity-55'
      )}
    >
      {/* 折叠头：标题、类型副行、启停开关、展开箭头，新增草稿不渲染 */}
      {!isDraft && entry && (
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors hover:bg-muted/50"
          onClick={() => onOpenChange(!open)}
        >
          <div className="flex-1 min-w-0">
            <span className="block truncate text-body font-medium text-foreground">
              {entry.title}
            </span>
            <span className="mt-0.5 block truncate text-caption text-muted-foreground">
              {entry.type === 'pinned'
                ? t('memory.pinnedSubline')
                : entry.keys.length > 0
                  ? entry.keys.join(' · ')
                  : t('memory.noKeys')}
            </span>
          </div>
          <Switch
            checked={entry.enabled}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={(v) => onUpdate?.(entry.uid, { enabled: v })}
          />
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200',
              !open && '-rotate-90'
            )}
          />
        </div>
      )}

      {/* 展开编辑区：标题、内容、类型、触发词、删除与保存 */}
      <Collapsible.Content className="collapsible-content">
        <div className="border-t border-border px-4 py-3.5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-foreground">
              {t('memory.titleLabel')}
            </span>
            <input
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder={t('memory.titlePlaceholder')}
              className="h-9 rounded-lg border border-border bg-background px-3 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-foreground">
              {t('memory.contentLabel')}
            </span>
            <textarea
              value={draft.content}
              onChange={(e) =>
                setDraft((d) => ({ ...d, content: e.target.value }))
              }
              placeholder={t('memory.contentPlaceholder')}
              className="w-full min-h-[72px] rounded-lg border border-border px-3 py-2 text-body text-foreground bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* 类型选择：先定注入方式，常驻条目每轮注入不经过匹配，触发词输入随之隐藏 */}
          <div className="flex items-center gap-3">
            <span className="text-caption font-medium text-foreground">
              {t('memory.typeLabel')}
            </span>
            <div className="flex rounded-lg border border-border p-0.5">
              {(
                [
                  { value: 'pinned', label: t('memory.typePinned') },
                  { value: 'triggered', label: t('memory.typeTriggered') },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={label}
                  onClick={() => setDraft((d) => ({ ...d, type: value }))}
                  className={cn(
                    'rounded-md px-3 py-1 text-caption transition-colors',
                    draft.type === value
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 触发词只对触发类型有意义，常驻条目每轮注入不经过匹配，编辑区随之隐藏 */}
          {draft.type === 'triggered' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-caption font-medium text-foreground">
                {t('memory.keysLabel')}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {draft.keys.map((key) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 pl-2 pr-1 py-0.5 text-caption text-foreground"
                  >
                    {key}
                    <button
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          keys: d.keys.filter((k) => k !== key),
                        }))
                      }
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-caption">
                  <Plus className="w-3 h-3 text-muted-foreground" />
                  <input
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addKey();
                      }
                    }}
                    onBlur={addKey}
                    placeholder={t('memory.addKey')}
                    className="w-24 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {!isDraft && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                onMouseLeave={() => setConfirmDelete(false)}
                className={cn(
                  'text-muted-foreground hover:text-red-600',
                  confirmDelete && 'text-red-600 hover:text-red-600'
                )}
              >
                {confirmDelete ? t('memory.deleteConfirm') : t('memory.delete')}
              </Button>
            )}
            <div
              className={cn('flex items-center gap-2', isDraft && 'ml-auto')}
            >
              <Button variant="outline" size="sm" onClick={handleCancel}>
                {t('memory.cancel')}
              </Button>
              <Button size="sm" disabled={!canSave} onClick={handleSave}>
                {t('memory.save')}
              </Button>
            </div>
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
