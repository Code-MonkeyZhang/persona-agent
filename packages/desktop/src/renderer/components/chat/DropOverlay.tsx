/**
 * @file 聊天区拖放遮罩，形态照 dsh
 * 铺聊天区容器全域，压暗加深背景模糊，一百六十毫秒淡入，pointer-events none 不干扰拖拽判定
 * 中央插画加标题加上限行；禁止态换禁止图标隐藏上限行，与 dropEffect none 的语义一致
 * 挂载即播淡入动画，熄灭由父级卸载承担，不做退出动画
 */
import { useTranslation } from 'react-i18next';
import { Ban } from 'lucide-react';
import { MAX_ATTACHMENTS, MAX_ATTACH_BYTES } from '../../lib/attachments';

/** 三文件叠放插画，与施工计划预览的遮罩样品同款 */
function DropIllustration() {
  return (
    <svg
      width="115"
      height="84"
      viewBox="0 0 115 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        y="17"
        width="44"
        height="43"
        rx="12"
        transform="rotate(-22.7 0 17)"
        fill="#9CE5ED"
      />
      <rect
        x="73.4"
        y="8.5"
        width="43.7"
        height="50.5"
        rx="8"
        transform="rotate(17.4 73.4 8.5)"
        fill="#679EFE"
      />
      <rect
        x="31.6"
        y="38.7"
        width="44.9"
        height="44.4"
        rx="12"
        fill="#3964FE"
      />
      <circle cx="60.6" cy="52.2" r="4.4" fill="#fff" />
    </svg>
  );
}

/** 禁止态与接收态共用同一个遮罩底子，只有中央内容不同 */
export function DropOverlay({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[rgba(28,37,48,0.30)] backdrop-blur-[10px] animate-drop-in">
      {blocked ? (
        <>
          <Ban className="h-12 w-12 text-white/80" />
          <span className="text-[20px] font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.25)]">
            {t('inputBox.dropBlocked')}
          </span>
        </>
      ) : (
        <>
          <DropIllustration />
          <span className="text-[20px] font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.25)]">
            {t('inputBox.dropToAttach')}
          </span>
          <span className="text-sm text-white/85">
            {t('inputBox.dropLimitHint', {
              max: MAX_ATTACHMENTS,
              size: MAX_ATTACH_BYTES / 1024 / 1024,
            })}
          </span>
        </>
      )}
    </div>
  );
}
