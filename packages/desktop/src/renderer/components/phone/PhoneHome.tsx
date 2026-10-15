/**
 * @file components/phone/PhoneHome.tsx
 * @description 手机桌面态。上方大时钟与日期，下方四列网格按偏好文档对账排位。
 *   拖拽重排由 dnd-kit 托管，rectSwapping 策略在拖动中实时对调两个格子，
 *   松手按对调结果还原成槽位数组提交，与手机端的 swap 语义一致。
 *   点击图标的启动语义是点开与收起，文字与图标底随壁纸深浅双态切换。
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arraySwap,
  rectSwappingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {
  EMPTY_ID_PREFIX,
  reconcileOrder,
  toGridItems,
  itemsToOrder,
} from '@persona/shared';
import { useAppPanelStore } from '../../stores/appPanelStore';
import { useLauncherPrefsStore } from '../../stores/launcherPrefsStore';
import { useNow } from '../../hooks/useNow';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';

const GRID_COLS = 4;

/** 小手机内置设置伪 App 的保留槽位 id，slot 前缀不与真应用撞名 */
export const SETTINGS_SLOT_ID = 'slot:settings';

interface GridTileProps {
  id: string;
  empty: boolean;
  settings: boolean;
  label: string;
  dark: boolean;
  logoUrl?: string;
  fallbackChar?: string;
  onOpen: () => void;
}

/**
 * 单个桌面格子。空格子禁用拖动只做落放目标，
 * 有主格子挂指针监听，拖动中格子本体跟手平移。
 */
function GridTile({
  id,
  empty,
  settings,
  label,
  dark,
  logoUrl,
  fallbackChar,
  onOpen,
}: GridTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id, disabled: { draggable: empty } });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(
        'group relative flex flex-col items-center gap-[7px] rounded-2xl transition-colors select-none',
        isOver && 'bg-[#228be6]/[0.08]'
      )}
    >
      {!empty && (
        <>
          <button
            onClick={onOpen}
            title={label}
            className={cn(
              'relative w-14 h-14 rounded-[17px] border shadow-soft flex items-center justify-center overflow-hidden transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:scale-[1.04]',
              dark
                ? 'bg-white/90 border-white/40'
                : 'bg-background border-[#ececec]'
            )}
          >
            {settings ? (
              <Settings className="w-[30px] h-[30px] text-muted-foreground" />
            ) : (
              <>
                <span className="text-base font-medium text-muted-foreground">
                  {fallbackChar}
                </span>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={label}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </>
            )}
          </button>
          <span
            className={cn(
              'text-[11px] max-w-[80px] truncate transition-colors',
              dark
                ? 'text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.45)]'
                : 'text-[#3a3f47]'
            )}
          >
            {label}
          </span>
        </>
      )}
    </div>
  );
}

export function PhoneHome({ dark }: { dark: boolean }) {
  const { t, i18n } = useTranslation();
  const apps = useAppPanelStore((s) => s.apps);
  const selectedApp = useAppPanelStore((s) => s.selectedApp);
  const selectApp = useAppPanelStore((s) => s.selectApp);
  const storedOrder = useLauncherPrefsStore(
    (s) => s.appOrder?.payload.appOrder ?? null
  );
  const submitOrder = useLauncherPrefsStore((s) => s.submitOrder);
  const now = useNow();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  /**
   * 偏好文档与当前清单对账成展示序。
   * null 是显式空格子，新应用填进第一个空位，清单里没有的条目清掉，
   * 设置槽位永不清理，固定四列至少四行，尾部空格子是拖放目标。
   */
  const view = useMemo(() => {
    const cells = reconcileOrder(
      storedOrder,
      apps.map((a) => a.name),
      [SETTINGS_SLOT_ID]
    );
    const minCells = GRID_COLS * 4;
    const cellCount = Math.max(
      minCells,
      Math.ceil(cells.length / GRID_COLS) * GRID_COLS
    );
    return [
      ...cells,
      ...Array.from({ length: cellCount - cells.length }, () => null),
    ];
  }, [storedOrder, apps]);

  /** 条目模型是拖拽库的直接数据源，空位以占位 id 在场 */
  const items = useMemo(() => toGridItems(view), [view]);

  /** 排列视图变化时落一行日志，与手机端共用 order view 关键词，排查两端排列对齐 */
  useEffect(() => {
    logger.info(`PhoneHome: order view ${JSON.stringify(view)}`);
  }, [view]);

  /** 松手把对调后的条目数组还原成槽位数组提交，落点为空或原地不动则跳过 */
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from === -1 || to === -1) return;
    logger.info(
      `PhoneHome: drag swap ${String(active.id)} <-> ${String(over.id)}`
    );
    void submitOrder(itemsToOrder(arraySwap(items, from, to)));
  };

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const locale = i18n.language === 'en' ? 'en-US' : 'zh-CN';
  const dateStr = now.toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="mt-[9vh] text-center">
        <div
          className={cn(
            'text-[56px] leading-none font-extralight tracking-wide tabular-nums transition-colors',
            dark
              ? 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]'
              : 'text-[#111827]'
          )}
        >
          {hh}:{mm}
        </div>
        <div
          className={cn(
            'mt-2 text-caption transition-colors',
            dark
              ? 'text-white/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]'
              : 'text-[#6b7280]'
          )}
        >
          {dateStr}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={rectSwappingStrategy}>
          <div className="mt-12 flex-1 min-h-0 px-5 grid grid-cols-4 auto-rows-[84px] gap-y-5 gap-x-2 content-start">
            {apps.length === 0 && (
              <div className="col-span-4 pb-2 text-center text-micro text-muted-foreground">
                {t('phone.empty')}
              </div>
            )}
            {items.map((item) => {
              const appId = item.id.startsWith(EMPTY_ID_PREFIX)
                ? null
                : item.id;
              const app = appId
                ? (apps.find((a) => a.name === appId) ?? null)
                : null;
              const isSettings = appId === SETTINGS_SLOT_ID;
              return (
                <GridTile
                  key={item.id}
                  id={item.id}
                  empty={!appId || (!app && !isSettings)}
                  settings={isSettings}
                  label={
                    isSettings ? t('phone.settings') : (app?.displayName ?? '')
                  }
                  dark={dark}
                  logoUrl={app?.logoUrl}
                  fallbackChar={app?.displayName.charAt(0)}
                  onOpen={() => selectApp(selectedApp === appId ? null : appId)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
