/**
 * @file src/renderer/components/settings/VoiceConfigPanel.tsx
 * @description 语音服务配置面板，管理 MiniMax TTS API Key、模型选择、语音摘要阈值和克隆音色
 * 设置页面是独立 Electron 窗口，Toast 不可见，因此使用内联 UI 反馈
 * 所有配置通过服务端 API 读写，不依赖本地 store
 * 密钥不回显，已配置状态由服务端配置驱动，验证通过即清空输入框
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  Check,
  CheckCircle,
  XCircle,
  Volume2,
  Trash2,
  Upload,
  Plus,
  Pencil,
  X,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  getTtsConfig,
  updateTtsConfig,
  getTtsModels,
  getVoices,
  cloneVoice,
  deleteClonedVoice,
  renameClonedVoice,
  type TtsModel,
  type VoiceOption,
} from '../../lib/api';
import { verifyTtsApiKey, MINIMAX_DOCS_URL } from '../../lib/tts';
import { SettingRow } from '../common/SettingRow';
import { Card } from '../ui/Card';
import { ApiKeyCard } from './ApiKeyCard';
import { Button } from '../ui/Button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/Select';
import { useVoicePreview } from '../../hooks/useVoicePreview';
import { getRandomPreviewText } from '../../lib/utils';
import { toast } from '../../stores/toastStore';
import { logger } from '../../lib/logger';

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
]);

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

/**
 * 验证音频文件时长是否在 10s-5min 范围内
 * @returns 时长
 */
function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      reject(new Error(i18n.t('voice.cannotReadAudio')));
    };
    audio.src = URL.createObjectURL(file);
  });
}

/**
 * 自动生成克隆音色 ID：clone- + 时间戳后 13 位，保证字母开头且 ≥8 字符
 */
function generateVoiceId(): string {
  return `clone-${Date.now()}`;
}

/**
 * 语音服务配置面板，提供 MiniMax API Key 的输入、验证和保存，
 * TTS 模型选择，语音摘要阈值设置，以及克隆音色管理
 */
export const VoiceConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const [inputKey, setInputKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [models, setModels] = useState<TtsModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [savingModel, setSavingModel] = useState(false);

  const [thresholdInput, setThresholdInput] = useState('200');
  const [savingThreshold, setSavingThreshold] = useState(false);

  const [clonedVoices, setClonedVoices] = useState<VoiceOption[]>([]);
  const { playingId: previewingId, preview: previewVoice } = useVoicePreview();
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloneFileName, setCloneFileName] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const MIN_THRESHOLD = 0;
  const MAX_THRESHOLD = 9999;

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [config, modelsData, voicesData] = await Promise.all([
        getTtsConfig(),
        getTtsModels(),
        getVoices(),
      ]);
      setKeyConfigured(Boolean(config.apiKey));
      setSelectedModel(config.model);
      setThresholdInput(String(config.summaryThreshold));
      setModels(modelsData);
      setClonedVoices(voicesData.filter((v) => v.group === 'cloned'));
    } catch (error) {
      logger.error('[VoiceConfigPanel] Failed to load config:', error);
    }
  };

  /**
   * 验证并保存 API Key：
   * - 用输入的 Key 先试合成一段测试音频
   * - 验证通过：保存 Key 到服务端 + 清空输入框 + 显示成功提示
   * - 验证失败：显示错误提示，不保存
   */
  const handleSaveKey = async () => {
    const key = inputKey.trim();
    if (!key) {
      setFeedback({ type: 'error', message: t('voice.enterApiKey') });
      return;
    }

    setFeedback(null);
    setVerifying(true);
    try {
      await verifyTtsApiKey(key, selectedModel || undefined);
      await updateTtsConfig({ apiKey: key });
      setInputKey('');
      setKeyConfigured(true);
      setFeedback({ type: 'success', message: t('voice.apiKeyVerified') });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('voice.verifyFailed');
      setFeedback({ type: 'error', message });
    } finally {
      setVerifying(false);
    }
  };

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    setSavingModel(true);
    try {
      await updateTtsConfig({ model });
    } catch (err) {
      logger.error('[VoiceConfigPanel] Failed to save model:', err);
    } finally {
      setSavingModel(false);
    }
  };

  /** 输入过程中实时保存：过滤非数字 → 校正范围 → 写服务端 */
  const handleThresholdChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits === '') {
      setThresholdInput('');
      return;
    }
    const v = parseInt(digits, 10);
    const clamped = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, v));
    setThresholdInput(String(clamped));
  };

  /** 失焦时保存到服务端，空值回填为 0 */
  const handleThresholdBlur = async () => {
    const value = thresholdInput === '' ? 0 : parseInt(thresholdInput, 10);
    setThresholdInput(String(value));
    setSavingThreshold(true);
    try {
      await updateTtsConfig({ summaryThreshold: value });
    } catch (err) {
      logger.error('[VoiceConfigPanel] Failed to save threshold:', err);
    } finally {
      setSavingThreshold(false);
    }
  };

  /** 删除克隆音色 */
  const handleDeleteVoice = async (voiceId: string) => {
    try {
      await deleteClonedVoice(voiceId);
      setClonedVoices((prev) => prev.filter((v) => v.id !== voiceId));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('common.deleteFailed');
      toast.error(message);
    }
  };

  /** 行内重命名克隆音色，只改服务端本地配置不调 MiniMax 接口 */
  const handleRename = async (voiceId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      await renameClonedVoice(voiceId, name);
      setClonedVoices((prev) =>
        prev.map((v) => (v.id === voiceId ? { ...v, name } : v))
      );
      setRenamingId(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('common.saveFailed');
      toast.error(message);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCloneFile(file);
      setCloneFileName(file.name);
      if (!cloneName) {
        setCloneName(file.name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  /** 重置克隆表单状态 */
  const resetCloneForm = () => {
    setShowCloneForm(false);
    setCloneName('');
    setCloneFile(null);
    setCloneFileName('');
  };

  /**
   * 提交克隆音色：
   * - 前端自动生成 voice_id
   * - 校验文件格式、大小、时长
   * - 调服务端克隆接口
   * - 刷新克隆列表
   */
  const handleClone = async () => {
    if (!cloneName.trim()) {
      toast.warning(t('voice.enterVoiceName'));
      return;
    }
    if (!cloneFile) {
      toast.warning(t('voice.selectAudioFile'));
      return;
    }

    if (!ALLOWED_AUDIO_TYPES.has(cloneFile.type)) {
      toast.warning(t('voice.audioFormatUnsupported'));
      return;
    }
    if (cloneFile.size > 20 * 1024 * 1024) {
      toast.warning(t('voice.fileSizeExceeded'));
      return;
    }

    try {
      const duration = await getAudioDuration(cloneFile);
      if (duration < 10 || duration > 300) {
        toast.warning(t('voice.audioDurationInvalid'));
        return;
      }
    } catch {
      toast.error(t('voice.cannotReadAudioDuration'));
      return;
    }

    setCloning(true);
    try {
      const voiceId = generateVoiceId();
      await cloneVoice(cloneFile, voiceId, cloneName.trim());
      const voices = await getVoices();
      setClonedVoices(voices.filter((v) => v.group === 'cloned'));
      resetCloneForm();
      toast.success(t('voice.cloneSuccess'));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('voice.cloneFailed');
      toast.error(message);
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="p-5 flex flex-col gap-4">
      {/* API Key 配置：品牌头部与密钥区，密钥不回显，绿勾由服务端配置驱动 */}
      <ApiKeyCard
        providerId="minimax"
        providerName="MiniMax"
        desc={t('voice.minimaxDesc')}
        docsUrl={MINIMAX_DOCS_URL}
        apiKey={inputKey}
        onApiKeyChange={setInputKey}
        placeholder={t('voice.enterMinimaxApiKey')}
        verifyLabel={t('voice.verifyAndSave')}
        verifyingLabel={t('voice.verifying')}
        verifying={verifying}
        verified={keyConfigured}
        onVerify={handleSaveKey}
        feedback={
          feedback && (
            <p
              className={`text-caption mt-2 flex items-center gap-1 ${feedback.type === 'success' ? 'text-green-600' : 'text-red-500'}`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {feedback.message}
            </p>
          )
        }
        className="rounded-xl border border-border bg-background px-4 py-4"
      />

      {/* 语音参数 */}
      <Card
        title={t('voice.params')}
        titleClassName="text-title-section font-semibold"
      >
        <div className="flex flex-col gap-4">
          <SettingRow label={t('voice.ttsModel')}>
            <Select
              value={selectedModel}
              onValueChange={handleModelChange}
              disabled={savingModel}
            >
              <SelectTrigger className="rounded-lg border-input h-8 w-48 text-body">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            label={t('voice.summaryThreshold')}
            tooltip={t('voice.summaryThresholdTooltip')}
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={thresholdInput}
                onChange={(e) => handleThresholdChange(e.target.value)}
                onBlur={handleThresholdBlur}
                disabled={savingThreshold}
                className="w-20 h-8 px-3 text-body text-right border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-muted-foreground"
              />
              <span className="text-caption text-muted-foreground">
                {t('voice.characters')}
              </span>
            </div>
          </SettingRow>
        </div>
      </Card>

      {/* 克隆音色管理 */}
      <Card
        title={t('voice.cloneManagement')}
        titleClassName="text-title-section font-semibold"
        desc={t('voice.cloneDesc')}
        action={
          !showCloneForm && (
            <Button
              variant="outline"
              onClick={() => setShowCloneForm(true)}
              className="rounded-lg border-border h-8 text-body px-3"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('voice.cloneNew')}
            </Button>
          )
        }
      >
        {showCloneForm && (
          <div className="mb-4 p-4 rounded-lg border border-dashed border-border bg-muted">
            <div className="flex items-center justify-between mb-3">
              <span className="text-body font-medium text-foreground">
                {t('voice.uploadClone')}
              </span>
              <button
                onClick={resetCloneForm}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <div className="text-caption text-muted-foreground mb-1">
                  {t('voice.voiceName')}
                </div>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder={t('voice.voiceNamePlaceholder')}
                  className="w-full h-8 px-3 text-body border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                />
              </div>

              <div>
                <div className="text-caption text-muted-foreground mb-1">
                  {t('voice.audioFile')}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-border hover:border-foreground/40 transition-colors cursor-pointer text-caption text-muted-foreground">
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {cloneFileName || t('voice.selectAudioFileBtn')}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.m4a,.wav"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  <span className="text-micro text-muted-foreground">
                    {t('voice.audioFileHint')}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-1">
                <Button
                  variant="outline"
                  onClick={resetCloneForm}
                  className="rounded-lg border-border h-8 text-body px-3"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleClone}
                  disabled={!cloneName.trim() || !cloneFile || cloning}
                  className="bg-foreground text-white hover:bg-foreground/90 rounded-lg h-8 text-body px-4"
                >
                  {cloning ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t('voice.cloning')}
                    </span>
                  ) : (
                    t('voice.startClone')
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {clonedVoices.length === 0 ? (
          <div className="text-muted-foreground text-body py-6 text-center border border-dashed border-border rounded-lg">
            {t('voice.noClonedVoices')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {clonedVoices.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted"
              >
                {renamingId === v.id ? (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(v.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="rounded-lg border border-input h-7 px-2 text-body flex-1 focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => void handleRename(v.id)}
                    >
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setRenamingId(null)}
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="text-body font-medium text-foreground truncate">
                      {v.name}
                    </div>
                  </div>
                )}

                {renamingId !== v.id && (
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() =>
                        previewVoice(v.id, getRandomPreviewText(t), {
                          noKey: t('voice.configureApiKeyFirst'),
                          failed: t('voice.previewFailed'),
                        })
                      }
                      disabled={previewingId === v.id}
                      className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t('voice.preview')}
                    >
                      {previewingId === v.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(v.id);
                        setRenameValue(v.name);
                      }}
                      className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                      title={t('common.rename')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteVoice(v.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
