/**
 * @file src/renderer/components/VoiceConfigPanel.tsx
 * @description 语音服务配置面板，管理 MiniMax TTS API Key、模型选择、语音摘要阈值和克隆音色
 * 设置页面是独立 Electron 窗口，Toast 不可见，因此使用内联 UI 反馈
 * 所有配置通过服务端 API 读写，不依赖本地 store
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  CheckCircle,
  XCircle,
  Volume2,
  Trash2,
  Upload,
  Plus,
  X,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  getTtsConfig,
  updateTtsConfig,
  getTtsModels,
  getVoices,
  cloneVoice,
  deleteClonedVoice,
  type TtsModel,
  type VoiceOption,
} from '../lib/api';
import { synthesize } from '../lib/tts';
import { SettingRow, SettingDivider } from './SettingRow';
import { HelpTooltip } from './ui/HelpTooltip';
import { PasswordInput } from './ui/PasswordInput';
import { useVoicePreview } from '../hooks/useVoicePreview';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';

const VERIFY_TEXT = '测试语音功能连接';

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
 * @returns 时长（秒）
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
      setInputKey(config.apiKey);
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
   * 1. 用输入的 Key 调一次 synthesize 合成测试文本
   * 2. 验证通过：保存 Key 到服务端 + 显示成功提示
   * 3. 验证失败：显示错误提示，不保存
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
      await synthesize(
        VERIFY_TEXT,
        'male-qn-qingse',
        key,
        selectedModel || 'speech-2.8-hd'
      );
      await updateTtsConfig({ apiKey: key });
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
   * 1. 前端自动生成 voice_id
   * 2. 校验文件格式、大小、时长
   * 3. 调服务端克隆接口
   * 4. 刷新克隆列表
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
      {/* API Key 配置 */}
      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-[#333] mb-1">
          {t('voice.minimaxTitle')}
        </h3>
        <p className="text-[12px] text-[#999] mb-4">{t('voice.minimaxDesc')}</p>

        <SettingRow label="API Key">
          <div className="flex items-center gap-2">
            <PasswordInput
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder={t('voice.enterMinimaxApiKey')}
            />
            <button
              onClick={handleSaveKey}
              disabled={!inputKey.trim() || verifying}
              className="h-8 px-3 text-[13px] rounded-lg border border-[#d0d0d0] text-[#666] hover:text-[#333] hover:border-[#999] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {verifying ? t('voice.verifying') : t('voice.verifyAndSave')}
            </button>
          </div>
        </SettingRow>

        {feedback && (
          <p
            className={`text-[12px] mt-2 flex items-center gap-1 ${feedback.type === 'success' ? 'text-green-600' : 'text-red-500'}`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            {feedback.message}
          </p>
        )}
      </div>

      {/* 语音参数 */}
      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-[#333] mb-3">
          {t('voice.params')}
        </h3>
        <SettingRow label={t('voice.ttsModel')}>
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={savingModel}
            className="rounded-lg border border-[#e0e0e0] h-8 w-48 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingDivider />
        <div className="flex items-center justify-between min-h-[32px] gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[14px] text-[#333] leading-[18px]">
              {t('voice.summaryThreshold')}
              <HelpTooltip text={t('voice.summaryThresholdTooltip')} />
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={thresholdInput}
              onChange={(e) => handleThresholdChange(e.target.value)}
              onBlur={handleThresholdBlur}
              disabled={savingThreshold}
              className="w-20 h-8 px-3 text-[13px] text-right border border-[#e0e0e0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#999]"
            />
            <span className="text-[12px] text-[#999]">
              {t('voice.characters')}
            </span>
          </div>
        </div>
      </div>

      {/* 克隆音色管理 */}
      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[14px] font-bold text-[#333]">
              {t('voice.cloneManagement')}
            </h3>
            <p className="text-[12px] text-[#999] mt-0.5">
              {t('voice.cloneDesc')}
            </p>
          </div>
          {!showCloneForm && (
            <button
              onClick={() => setShowCloneForm(true)}
              className="h-8 px-3 text-[13px] rounded-lg border border-[#d0d0d0] text-[#666] hover:text-[#333] hover:border-[#999] transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('voice.cloneNew')}
            </button>
          )}
        </div>

        {showCloneForm && (
          <div className="mb-4 p-4 rounded-lg border border-dashed border-[#d0d0d0] bg-[#fafafa]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#333]">
                {t('voice.uploadClone')}
              </span>
              <button
                onClick={resetCloneForm}
                className="text-[#999] hover:text-[#333]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[12px] text-[#666] mb-1">
                  {t('voice.voiceName')}
                </div>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder={t('voice.voiceNamePlaceholder')}
                  className="w-full h-8 px-3 text-[13px] border border-[#e0e0e0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#999]"
                />
              </div>

              <div>
                <div className="text-[12px] text-[#666] mb-1">
                  {t('voice.audioFile')}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-[#d0d0d0] hover:border-[#999] transition-colors cursor-pointer text-[12px] text-[#666]">
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
                  <span className="text-[11px] text-[#999]">
                    {t('voice.audioFileHint')}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-1">
                <button
                  onClick={resetCloneForm}
                  className="h-8 px-3 text-[13px] rounded-lg border border-[#e0e0e0] text-[#666] hover:text-[#333] transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleClone}
                  disabled={!cloneName.trim() || !cloneFile || cloning}
                  className="bg-[#222] text-white hover:bg-[#333] rounded-lg h-8 px-4 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cloning ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t('voice.cloning')}
                    </span>
                  ) : (
                    t('voice.startClone')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {clonedVoices.length === 0 ? (
          <div className="text-[#ccc] text-[13px] py-6 text-center border border-dashed border-[#e8e8e8] rounded-lg">
            {t('voice.noClonedVoices')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {clonedVoices.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#eee] bg-[#fafafa]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#333]">
                    {v.name}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  <button
                    onClick={() =>
                      previewVoice(v.id, '你好，这是克隆音色的试听效果。', {
                        noKey: t('voice.configureApiKeyFirst'),
                        failed: t('voice.previewFailed'),
                      })
                    }
                    disabled={previewingId === v.id}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-[#999] hover:text-[#333] hover:bg-[#f0f0f0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('voice.preview')}
                  >
                    {previewingId === v.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteVoice(v.id)}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-[#999] hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
