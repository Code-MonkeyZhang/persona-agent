/**
 * @file src/renderer/components/chat/InputBox.tsx
 * @description 聊天输入框组件 - 负责用户消息的输入、编辑和发送
 *
 * 包含以下功能：
 * - 多行文本输入，自动根据内容调整高度
 * - 按 Enter 发送消息，Shift+Enter 换行，发送被否决时正文保留
 * - 附件入口三条：加号选择器、聊天区拖放、文件粘贴，全部汇到 addFiles 共用上限与过滤
 * - 附件草稿条：图片缩略图与文件卡同高混排，发送期转圈蒙层、失败红卡单项重试
 * - 附件在发送动作里先压缩再统一起传，全部成功才进消息，空正文仅附件是合法消息
 * - 当前模型不支持图片时草稿含图亮黄色横幅，只提示不拦截发送
 * - 底部工具栏：添加附件按钮、工作目录选择器、模型选择器、发送按钮
 * - 断开与重连期间禁用输入与发送，占位文案随状态切换
 */

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import { EyeOff, Loader2, Plus, RotateCw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Gallery, Item } from 'react-photoswipe-gallery';
import { cn } from '../../lib/utils';
import { useChatInput } from '../../hooks/useChatInput';
import { useAttachments } from '../../hooks/useAttachments';
import {
  fileExtOf,
  formatFileSize,
  getAttachmentPresentation,
  previewItemProps,
  MAX_ATTACHMENTS,
  MAX_ATTACH_BYTES,
} from '../../lib/attachments';
import { ModelSelector } from '../common/ModelSelector';
import { WorkspaceSelector } from '../common/WorkspaceSelector';
import { HoverDeleteButton } from '../ui/HoverDeleteButton';
import type { ProviderStatus } from '../../lib/api';
import type { UIAttachment } from '../../types/chat';
import { useChatStore } from '../../stores/chatStore';
import { toast } from '../../stores/toastStore';
import { logger } from '../../lib/logger';

/**
 * InputBox 组件的属性接口
 */
interface InputBoxProps {
  onSend: (message: string, attachments: UIAttachment[]) => void;
  onAbort?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  providers: ProviderStatus[];
  currentModelId: string;
  currentProviderId: string | undefined;
  workspacePath: string | undefined;
  onModelChange: (modelId: string) => void;
  onProviderChange: (providerId: string) => void;
  onWorkspaceChange: (path: string | undefined) => void;
}

/** 对外暴露的注入口：聊天区拖放松手后从 App 经此走同一条 addFiles */
export interface InputBoxRef {
  addDroppedFiles: (files: File[]) => void;
}

/** 草稿区图片缩略图：64px 方块，发送期 uploading 转圈遮罩、error 红色蒙层点击重试，hover 出删除
 *  点击经 PhotoSwipe 打开大图预览；失败态不给点开 */
function AttachThumb({
  image,
  onRemove,
  onRetry,
}: {
  image: UIAttachment;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const { t } = useTranslation();
  const previewable = image.status !== 'error';
  return (
    <Item {...previewItemProps(image)}>
      {({ ref, open }) => (
        <div
          ref={ref}
          onClick={previewable ? open : undefined}
          className={cn(
            'group relative w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0',
            previewable && 'cursor-zoom-in'
          )}
        >
          <img
            src={image.url}
            alt={image.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
          {image.status === 'uploading' && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </div>
          )}
          {image.status === 'error' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry(image.id);
              }}
              title={t('inputBox.retryUpload')}
              className="absolute inset-0 bg-destructive/60 flex items-center justify-center"
            >
              <RotateCw className="w-4 h-4 text-white" />
            </button>
          )}
          <HoverDeleteButton
            className="absolute top-0.5 right-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(image.id);
            }}
          />
        </div>
      )}
    </Item>
  );
}

/** 草稿区文件卡：与图片缩略图同高的定宽横卡，图标槽按扩展名取预设
 *  发送期 uploading 整卡蒙层转圈，error 红色蒙层点击重试，元信息行为扩展名加点号加可读大小 */
function FileChip({
  file,
  onRemove,
  onRetry,
}: {
  file: UIAttachment;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const { t } = useTranslation();
  const preset = getAttachmentPresentation(file.name);
  const Icon = preset.icon;
  return (
    <div
      className={cn(
        'group relative flex w-56 h-16 items-center gap-2.5 rounded-lg border border-border bg-background pl-2 pr-3 shrink-0',
        file.status === 'error' && 'border-destructive/40'
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-md flex items-center justify-center shrink-0',
          preset.iconClassName
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1" title={file.name}>
        <div className="text-caption font-medium truncate">{file.name}</div>
        <div className="text-micro text-muted-foreground">
          {fileExtOf(file.name)} · {formatFileSize(file.bytes)}
        </div>
      </div>
      {file.status === 'uploading' && (
        <div className="absolute inset-0 rounded-lg bg-background/60 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        </div>
      )}
      {file.status === 'error' && (
        <button
          onClick={() => onRetry(file.id)}
          title={t('inputBox.retryUpload')}
          className="absolute inset-0 rounded-lg bg-destructive/10 flex items-center justify-center"
        >
          <RotateCw className="w-4 h-4 text-destructive" />
        </button>
      )}
      <HoverDeleteButton
        className="absolute -top-1.5 -right-1.5"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(file.id);
        }}
      />
    </div>
  );
}

/**
 * 聊天输入框组件
 *
 * 提供消息输入、附件草稿、模型选择、工作目录选择和消息发送功能。
 * 文本框支持多行输入和自动高度调节，按 Enter 发送，Shift+Enter 换行。
 *
 * @param props - 组件属性，参见 {@link InputBoxProps}
 * @returns 渲染的输入框 JSX 元素
 */
export const InputBox = forwardRef<InputBoxRef, InputBoxProps>(
  function InputBox(
    {
      onSend,
      onAbort,
      isLoading,
      disabled,
      providers,
      currentModelId,
      currentProviderId,
      workspacePath,
      onModelChange,
      onProviderChange,
      onWorkspaceChange,
    },
    ref
  ) {
    const { t } = useTranslation();
    const connectionStatus = useChatStore((s) => s.connectionStatus);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /** 断开与重连期间发送不可能成功，禁用输入与发送并切换占位文案 */
    const connBlocked =
      connectionStatus === 'disconnected' ||
      connectionStatus === 'reconnecting';

    const attachments = useAttachments({
      onLimitReached: () =>
        toast.info(t('inputBox.attachmentLimit', { max: MAX_ATTACHMENTS })),
      onOversize: () =>
        toast.info(
          t('inputBox.fileOversize', {
            size: MAX_ATTACH_BYTES / 1024 / 1024,
          })
        ),
    });

    /** 模型能力来自 providers 接口的 visionModelIds，非视觉模型对图片只做横幅提示不拦截发送 */
    const modelNoVision = (() => {
      const provider = providers.find((p) => p.id === currentProviderId);
      if (!provider?.visionModelIds) return false;
      return !provider.visionModelIds.includes(currentModelId);
    })();
    const hasImageDraft = attachments.items.some((i) => i.kind === 'image');

    /** 聊天区拖放的注入口，App 的 useChatDrop 松手后调到这里，与加号和粘贴同一条 addFiles */
    useImperativeHandle(
      ref,
      () => ({
        addDroppedFiles: (files) => {
          void attachments.addFiles(files);
        },
      }),
      [attachments]
    );

    /** 发送流程：上传期间再点发送提示稍等，附件先压缩再统一起传，
     *  全部成功才进消息并清空草稿，有失败保留草稿与正文等用户重试或删除。
     *  消息用 uploadAll 的返回值组装，上传落定的哈希与元数据不在旧快照里读 */
    const handleSend = useCallback(
      async (content: string): Promise<boolean> => {
        if (attachments.isUploading) {
          logger.info('Send blocked, attachments uploading');
          toast.info(t('inputBox.attachmentUploading'));
          return false;
        }
        const settled = await attachments.uploadAll();
        if (!settled) {
          logger.warn('Send blocked, attachment upload failed');
          toast.info(t('inputBox.sendUploadFailed'));
          return false;
        }
        logger.info('Send delivered', {
          textLength: content.length,
          attachments: settled.length,
        });
        onSend(content, settled);
        attachments.clear();
        return true;
      },
      [onSend, attachments, t]
    );

    const { input, textareaRef, handleChange, handleKeyDown, send } =
      useChatInput({
        maxHeight: 200,
        onSend: handleSend,
        allowEmptySend: () => attachments.items.length > 0,
      });

    /** 粘贴截图与文件：items 过滤 kind 为 file 后与选择器共用入口
     *  没有文字时才 preventDefault，防文件名等脏内容进输入框；有文字走默认粘贴，图文两边都拿到 */
    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(e.clipboardData.items)
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (files.length === 0) return;
        const hasText = e.clipboardData.getData('text/plain').length > 0;
        if (!hasText) e.preventDefault();
        logger.info('Paste received', { files: files.length, hasText });
        attachments.addFiles(files);
      },
      [attachments]
    );

    const canSend =
      (input.trim().length > 0 || attachments.items.length > 0) &&
      !attachments.isUploading &&
      !attachments.hasError &&
      !disabled &&
      !connBlocked;

    return (
      <div className="px-4 pb-4">
        {/* 输入框容器：常驻激活态，白底加淡描边，不随焦点切换 */}
        <div className="relative flex flex-col rounded-[24px] ring-1 ring-foreground/20 bg-background shadow-none">
          {/* 非视觉模型遇图片草稿的黄色横幅，只提示不拦截，替换发生在请求侧 */}
          {modelNoVision && hasImageDraft && (
            <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-caption text-amber-800">
              <EyeOff className="h-4 w-4 shrink-0" />
              <span>{t('inputBox.modelNoVision')}</span>
            </div>
          )}

          {/* 附件草稿条：图片缩略图与文件卡混排，图片可点开大图 */}
          {attachments.items.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              <Gallery>
                {attachments.items.map((item) =>
                  item.kind === 'image' ? (
                    <AttachThumb
                      key={item.id}
                      image={item}
                      onRemove={attachments.remove}
                      onRetry={attachments.retry}
                    />
                  ) : (
                    <FileChip
                      key={item.id}
                      file={item}
                      onRemove={attachments.remove}
                      onRetry={attachments.retry}
                    />
                  )
                )}
              </Gallery>
            </div>
          )}

          {/* 文本输入区域 */}
          <div
            className={cn(
              'px-3 pb-1',
              attachments.items.length > 0 ? 'pt-1' : 'pt-3'
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={disabled || connBlocked}
              placeholder={
                connBlocked
                  ? t('inputBox.placeholderDisconnected')
                  : t('inputBox.placeholder')
              }
              rows={1}
              className="w-full bg-transparent resize-none focus:outline-none text-content text-foreground placeholder:text-placeholder min-h-[30px] disabled:cursor-not-allowed"
              style={{ maxHeight: '200px' }}
            />
          </div>

          {/* 底部工具栏：左侧为功能按钮，右侧为发送按钮 */}
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            {/* 左侧工具按钮组 */}
            <div className="flex items-center gap-1">
              {/* 添加附件按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors duration-150"
                title={t('inputBox.addAttachment')}
              >
                <Plus size={18} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) attachments.addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              {/* 工作目录选择器 */}
              <WorkspaceSelector
                value={workspacePath}
                onChange={onWorkspaceChange}
                disabled={false}
                compact
              />
              {/* 模型和供应商选择器 */}
              <ModelSelector
                providers={providers}
                value={currentModelId}
                onChange={onModelChange}
                providerValue={currentProviderId}
                onProviderChange={onProviderChange}
                showOnlyVerified={true}
                compact
              />
            </div>

            {/* 发送与停止并存：生成中发送变为插话排队，停止独立中止当前回合 */}
            <div className="flex items-center gap-1.5">
              {isLoading && onAbort && (
                <button
                  onClick={() => onAbort?.()}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all duration-200"
                  title={t('inputBox.stopGeneration')}
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              )}
              <button
                onClick={() => canSend && send()}
                disabled={!canSend}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200',
                  canSend
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                    : 'bg-muted/50 text-muted-foreground/40 cursor-not-allowed'
                )}
                title={
                  isLoading
                    ? t('inputBox.queueMessage')
                    : t('inputBox.sendMessage')
                }
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
