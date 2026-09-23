/**
 * @file src/renderer/components/settings/ApiKeyCard.tsx
 * @description API Key 管理组件，品牌头部、文档外链、密钥输入与验证按钮
 * 语音服务与模型供应商详情共用，验证交互与状态由调用方注入
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { PasswordInput } from '../ui/PasswordInput';
import { ProviderMark } from '../common/ProviderMark';

interface ApiKeyCardProps {
  providerId: string;
  providerName: string;
  desc: string;
  docsUrl?: string;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  placeholder: string;
  /** 验证按钮文案，已本地化 */
  verifyLabel: string;
  /** 验证中按钮文案，传入则显示文字，不传则显示转圈图标 */
  verifyingLabel?: string;
  verifying: boolean;
  /** 已配置标记，由调用方的服务端配置状态驱动 */
  verified: boolean;
  onVerify: () => void;
  /** 输入行下方的内联反馈节点，承接验证成功或失败的提示 */
  feedback?: React.ReactNode;
  /** 外层卡片类，语音服务传白卡含内边距，供应商详情不传 */
  className?: string;
}

/**
 * API Key 管理组件：品牌头部 + 密钥输入行 + 外置验证按钮。
 * - 文档外链在 docsUrl 缺省时不渲染
 * - 密钥不回显由调用方保证，组件只展示传入的输入值
 * @param providerId - 供应商 id，用于查图标注册表
 * @param providerName - 供应商显示名与品牌标题
 * @param desc - 品牌描述行
 * @param docsUrl - 可选的官方文档外链
 * @param apiKey - 密钥输入值
 * @param onApiKeyChange - 密钥输入回调
 * @param placeholder - 输入框占位文案
 * @param verifyLabel - 验证按钮文案
 * @param verifyingLabel - 可选的验证中文案
 * @param verifying - 验证中状态
 * @param verified - 已配置状态，驱动绿勾标记
 * @param onVerify - 验证触发回调
 * @param feedback - 可选的内联反馈节点
 * @param className - 追加到容器根节点的样式类
 */
export const ApiKeyCard: React.FC<ApiKeyCardProps> = ({
  providerId,
  providerName,
  desc,
  docsUrl,
  apiKey,
  onApiKeyChange,
  placeholder,
  verifyLabel,
  verifyingLabel,
  verifying,
  verified,
  onVerify,
  feedback,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <div className="mb-4 flex items-center gap-3">
        <ProviderMark providerId={providerId} name={providerName} size={48} />
        <div className="min-w-0">
          <h3 className="text-title-section font-semibold text-foreground mb-1">
            {providerName}
          </h3>
          <p className="text-caption text-muted-foreground">{desc}</p>
        </div>
        {docsUrl && (
          <Button
            asChild
            variant="outline"
            className="ml-auto shrink-0 h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground"
          >
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t('provider.officialDocs')}
              aria-label={t('provider.officialDocs')}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2.5">
          <span className="text-title-section font-semibold text-foreground">
            API Key
          </span>
          {verified && (
            <span className="flex items-center gap-0.5 text-caption text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('provider.configured')}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <PasswordInput
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={onVerify}
            disabled={!apiKey.trim() || verifying}
            className="rounded-lg border-input h-8 text-body px-3 shrink-0"
          >
            {verifying
              ? (verifyingLabel ?? <Loader2 className="w-4 h-4 animate-spin" />)
              : verifyLabel}
          </Button>
        </div>
        {feedback}
      </div>
    </div>
  );
};
