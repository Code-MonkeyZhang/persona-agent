/**
 * @file src/renderer/components/shell/SessionItem.tsx
 * @description 单个会话列表项组件，支持选中、删除、重命名及右键菜单操作
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Pencil, Check, X, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SessionMeta } from '../../types/session';
import { cn } from '../../lib/utils';
import { useInlineRename } from '../../hooks/useInlineRename';

interface SessionItemProps {
  session: SessionMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * 会话列表项组件，支持选中、删除、重命名及右键菜单操作
 */
export const SessionItem: React.FC<SessionItemProps> = ({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { editingKey, draft, setDraft, inputRef, start, confirm, cancel } =
    useInlineRename<string>((id, title) => onRename(id, title));
  const isEditing = editingKey === session.id;

  /**
   * 处理重命名输入框的键盘事件：Enter 保存，Escape 取消
   * @param e - 键盘事件
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    } else if (e.key === 'Escape') {
      cancel();
    }
  };

  /**
   * 打开右键菜单，根据屏幕空间自动调整菜单位置
   * @param e - 鼠标事件
   */
  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const MENU_HEIGHT_ESTIMATE = 120;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const top =
      spaceBelow >= MENU_HEIGHT_ESTIMATE
        ? rect.bottom + 4
        : Math.max(4, rect.top - MENU_HEIGHT_ESTIMATE - 4);
    setMenuPosition({ top, left: rect.right });
    setMenuOpen(true);
  };

  /**
   * 从菜单进入重命名模式
   * @param e - 鼠标事件
   */
  const handleMenuRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    start(session.id, session.title);
  };

  const handleMenuDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(session.id);
  };

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <>
      <div
        className={cn(
          'group relative pl-7 pr-7 py-2 rounded-lg cursor-pointer transition-colors',
          isActive ? 'bg-muted text-foreground' : 'hover:bg-muted'
        )}
        onClick={() => !isEditing && onSelect(session.id)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    confirm();
                  }}
                  className="p-1 rounded hover:bg-green-100 text-green-600"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cancel();
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <p
                  className={cn('text-sm truncate', isActive && 'font-medium')}
                >
                  {session.title}
                </p>
              </>
            )}
          </div>
        </div>

        {!isEditing && !session.id.startsWith('chat') && (
          <button
            onClick={handleMenuClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            title={t('sessionItem.moreActions')}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {menuOpen &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[140px] bg-background border border-border rounded-lg shadow-lg py-1"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              transform: 'translateX(-100%)',
            }}
          >
            <button
              onClick={handleMenuRename}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{t('sessionItem.rename')}</span>
            </button>
            <button
              onClick={handleMenuDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('sessionItem.delete')}</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
