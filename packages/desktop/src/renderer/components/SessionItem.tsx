/**
 * @file components/SessionItem.tsx
 * @description 单个会话列表项组件，支持选中、删除、重命名及右键菜单操作
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Pencil, Check, X, MoreVertical } from 'lucide-react';
import type { SessionMeta } from '../types/session';
import { cn } from '../lib/utils';

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
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  /**
   * 保存重命名结果，标题有效且变化时调用 onRename
   * @param e - 鼠标事件
   * @returns void
   */
  const handleSaveRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(session.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  /**
   * 取消重命名，恢复原标题并退出编辑模式
   * @param e - 鼠标事件
   */
  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditTitle(session.title);
  };

  /**
   * 处理重命名输入框的键盘事件：Enter 保存，Escape 取消
   * @param e - 键盘事件
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editTitle.trim() && editTitle !== session.title) {
        onRename(session.id, editTitle.trim());
      }
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditTitle(session.title);
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
    setIsEditing(true);
    setEditTitle(session.title);
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
          'group relative px-3 py-2 rounded-lg cursor-pointer transition-colors',
          isActive ? 'bg-[#f5f5f5] text-[#333]' : 'hover:bg-gray-100'
        )}
        onClick={() => !isEditing && onSelect(session.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveRename}
                  className="p-1 rounded hover:bg-green-100 text-green-600"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={handleCancelRename}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium truncate">{session.title}</p>
              </>
            )}
          </div>

          {!isEditing && isHovered && (
            <button
              onClick={handleMenuClick}
              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              title="更多操作"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {menuOpen &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[140px] bg-white border border-gray-200 rounded-lg shadow-lg py-1"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              transform: 'translateX(-100%)',
            }}
          >
            <button
              onClick={handleMenuRename}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>重命名</span>
            </button>
            <button
              onClick={handleMenuDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
