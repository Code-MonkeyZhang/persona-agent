/**
 * @file src/renderer/components/Toast.tsx
 * @description Toast 提示组件，在页面右上角展示全局通知消息
 */

import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToastStore, type ToastType } from '../stores/toastStore';

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
};

const bgColorMap: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  info: 'bg-blue-50 border-blue-200',
  warning: 'bg-yellow-50 border-yellow-200',
};

/**
 * 单条 Toast 消息组件，根据类型显示不同图标和背景色
 */
const ToastItem: React.FC<{
  id: string;
  type: ToastType;
  message: string;
  onRemove: (id: string) => void;
}> = ({ id, type, message, onRemove }) => {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm',
        'animate-in slide-in-from-right-full duration-300',
        bgColorMap[type]
      )}
    >
      {iconMap[type]}
      <span className="flex-1 text-sm text-gray-800">{message}</span>
      <button
        onClick={() => onRemove(id)}
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

/**
 * Toast 容器组件，从 toastStore 读取消息列表并在页面右上角渲染所有活跃 Toast
 */
export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          onRemove={removeToast}
        />
      ))}
    </div>
  );
};
