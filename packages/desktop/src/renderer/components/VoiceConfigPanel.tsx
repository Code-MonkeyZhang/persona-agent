/**
 * @file src/renderer/components/VoiceConfigPanel.tsx
 * @description 语音服务配置面板，管理 MiniMax TTS API Key、模型选择、语音摘要阈值和克隆音色
 * 设置页面是独立 Electron 窗口，Toast 不可见，因此使用内联 UI 反馈
 * 所有配置通过服务端 API 读写，不依赖本地 store
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  CheckCircle,
  Eye,
  EyeOff,
  XCircle,
  Volume2,
  Trash2,
  Upload,
  Plus,
  X,
  Loader2,
  HelpCircle,
} from 'lucide-react';
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
import { audioPlayer } from '../lib/audio-player';
import { SettingRow, SettingDivider } from './SettingRow';
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
      reject(new Error('无法读取音频文件'));
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
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [models, setModels] = useState<TtsModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [savingModel, setSavingModel] = useState(false);

  const [thresholdInput, setThresholdInput] = useState('200');
  const [savingThreshold, setSavingThreshold] = useState(false);

  const [clonedVoices, setClonedVoices] = useState<VoiceOption[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
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
      setFeedback({ type: 'error', message: '请输入 API Key' });
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
      setFeedback({ type: 'success', message: 'API Key 验证通过，已保存' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '验证失败';
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

  /** 试听克隆音色 */
  const handlePreviewVoice = async (voiceId: string) => {
    try {
      const config = await getTtsConfig();
      if (!config.apiKey) {
        toast.warning('请先配置 MiniMax API Key');
        return;
      }
      setPreviewingId(voiceId);
      const audio = await synthesize(
        '你好，这是克隆音色的试听效果。',
        voiceId,
        config.apiKey,
        config.model
      );
      audioPlayer.play(audio);
    } catch (err) {
      const message = err instanceof Error ? err.message : '试听失败';
      toast.error(message);
    } finally {
      setTimeout(() => setPreviewingId(null), 3000);
    }
  };

  /** 删除克隆音色 */
  const handleDeleteVoice = async (voiceId: string) => {
    try {
      await deleteClonedVoice(voiceId);
      setClonedVoices((prev) => prev.filter((v) => v.id !== voiceId));
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
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
      toast.warning('请输入音色名称');
      return;
    }
    if (!cloneFile) {
      toast.warning('请选择音频文件');
      return;
    }

    if (!ALLOWED_AUDIO_TYPES.has(cloneFile.type)) {
      toast.warning('仅支持 mp3、m4a、wav 格式');
      return;
    }
    if (cloneFile.size > 20 * 1024 * 1024) {
      toast.warning('文件大小不能超过 20MB');
      return;
    }

    try {
      const duration = await getAudioDuration(cloneFile);
      if (duration < 10 || duration > 300) {
        toast.warning('音频时长需在 10 秒到 5 分钟之间');
        return;
      }
    } catch {
      toast.error('无法读取音频时长，请检查文件');
      return;
    }

    setCloning(true);
    try {
      const voiceId = generateVoiceId();
      await cloneVoice(cloneFile, voiceId, cloneName.trim());
      const voices = await getVoices();
      setClonedVoices(voices.filter((v) => v.group === 'cloned'));
      resetCloneForm();
      toast.success('音色克隆成功');
    } catch (err) {
      const message = err instanceof Error ? err.message : '克隆失败';
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
          MiniMax（语音合成）
        </h3>
        <p className="text-[12px] text-[#999] mb-4">
          配置 MiniMax API Key 以启用语音播报功能
        </p>

        <SettingRow label="API Key">
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="输入 MiniMax API Key"
                className="w-64 h-8 px-3 text-[13px] border border-[#e0e0e0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#999] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              onClick={handleSaveKey}
              disabled={!inputKey.trim() || verifying}
              className="h-8 px-3 text-[13px] rounded-lg border border-[#d0d0d0] text-[#666] hover:text-[#333] hover:border-[#999] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {verifying ? '验证中...' : '验证并保存'}
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
        <h3 className="text-[14px] font-bold text-[#333] mb-3">语音参数</h3>
        <SettingRow label="TTS 模型">
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
              语音摘要阈值
              <span className="relative group">
                <HelpCircle className="w-3.5 h-3.5 text-[#999] cursor-help" />
                <span className="absolute left-5 top-1/2 -translate-y-1/2 w-60 px-2 py-1.5 text-[12px] text-[#666] bg-white border border-[#e0e0e0] rounded-lg shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10 pointer-events-none">
                  当回复超过此字符数时，会自动将内容总结后再播放，避免播报过长
                </span>
              </span>
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
            <span className="text-[12px] text-[#999]">字符</span>
          </div>
        </div>
      </div>

      {/* 克隆音色管理 */}
      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[14px] font-bold text-[#333]">克隆音色管理</h3>
            <p className="text-[12px] text-[#999] mt-0.5">
              上传音频克隆自定义音色，可在 Agent 中选用
            </p>
          </div>
          {!showCloneForm && (
            <button
              onClick={() => setShowCloneForm(true)}
              className="h-8 px-3 text-[13px] rounded-lg border border-[#d0d0d0] text-[#666] hover:text-[#333] hover:border-[#999] transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              克隆新音色
            </button>
          )}
        </div>

        {showCloneForm && (
          <div className="mb-4 p-4 rounded-lg border border-dashed border-[#d0d0d0] bg-[#fafafa]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#333]">
                上传音频克隆
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
                <div className="text-[12px] text-[#666] mb-1">音色名称</div>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder="给克隆的音色起个名字"
                  className="w-full h-8 px-3 text-[13px] border border-[#e0e0e0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#999]"
                />
              </div>

              <div>
                <div className="text-[12px] text-[#666] mb-1">音频文件</div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-[#d0d0d0] hover:border-[#999] transition-colors cursor-pointer text-[12px] text-[#666]">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{cloneFileName || '选择音频文件'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.m4a,.wav"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-[#999]">
                    mp3/m4a/wav, 10秒~5分钟
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-1">
                <button
                  onClick={resetCloneForm}
                  className="h-8 px-3 text-[13px] rounded-lg border border-[#e0e0e0] text-[#666] hover:text-[#333] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleClone}
                  disabled={!cloneName.trim() || !cloneFile || cloning}
                  className="bg-[#222] text-white hover:bg-[#333] rounded-lg h-8 px-4 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cloning ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      克隆中...
                    </span>
                  ) : (
                    '开始克隆'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {clonedVoices.length === 0 ? (
          <div className="text-[#ccc] text-[13px] py-6 text-center border border-dashed border-[#e8e8e8] rounded-lg">
            暂无克隆音色，点击上方按钮开始克隆
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
                    onClick={() => handlePreviewVoice(v.id)}
                    disabled={previewingId === v.id}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-[#999] hover:text-[#333] hover:bg-[#f0f0f0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="试听"
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
                    title="删除"
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
