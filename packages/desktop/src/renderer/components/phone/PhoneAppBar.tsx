/**
 * @file components/phone/PhoneAppBar.tsx
 * @description 小手机应用内实体顶栏，PhoneAppView 与 PhoneSettingsView 共用。
 * 单颗深底圆钮承载返回，中间白瓷药丸装迷你图标与标题并保持居中，
 * footer 槽位挂加载进度线或失败红条，规格对齐手机端 PhoneAppBar。
 * 桌面端返回与回桌面同义，手机端的右钮不移植。
 */

import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';

interface PhoneAppBarProps {
  /** 药丸标题 */
  title: string;
  /** 药丸里的迷你图标，应用传 logo 图，设置传齿轮 */
  tile: React.ReactNode;
  /** 返回钮动作，应用页回桌面，设置页逐层退 */
  onBack: () => void;
  /** 顶栏下方的附加行，加载进度线或失败红条 */
  footer?: React.ReactNode;
}

export function PhoneAppBar({ title, tile, onBack, footer }: PhoneAppBarProps) {
  const { t } = useTranslation();

  return (
    <div className="shrink-0 bg-background border-b border-border">
      <div className="grid grid-cols-[34px_1fr_34px] items-center px-3 pt-2 pb-2">
        <button
          onClick={onBack}
          title={t('phone.back')}
          className="w-[34px] h-[34px] rounded-full bg-[rgba(20,30,40,0.65)] flex items-center justify-center text-white hover:opacity-85 transition-opacity"
        >
          <ChevronLeft className="w-[22px] h-[22px]" />
        </button>
        <div className="flex items-center gap-[7px] min-w-0 max-w-[190px] justify-self-center pl-[5px] pr-3 py-1 rounded-full bg-white/[0.82] border border-[rgba(22,32,46,0.08)] shadow-[0_3px_5px_rgba(22,32,46,0.1)]">
          {tile}
          <span className="text-[13px] font-semibold text-[#16202e] truncate">
            {title}
          </span>
        </div>
      </div>
      {footer}
    </div>
  );
}
