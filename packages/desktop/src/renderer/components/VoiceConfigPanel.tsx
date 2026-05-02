/**
 * @file src/renderer/components/VoiceConfigPanel.tsx
 * @description 语音服务配置面板，管理 MiniMax TTS API Key 和语音摘要阈值
 * 设置页面是独立 Electron 窗口，Toast 不可见，因此使用内联 UI 反馈
 * 使用卡片分组 + SettingRow 统一行布局
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle, Eye, EyeOff, XCircle } from 'lucide-react';
import { useVoiceStore } from '../stores/voiceStore';
import { synthesize } from '../lib/tts';
import { SettingRow } from './SettingRow';

const VERIFY_TEXT = '测试语音功能连接';

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

/**
 * 语音服务配置面板，提供 MiniMax API Key 的输入、验证和保存功能
 * 保存前会先调用 TTS 接口验证 Key 的有效性，验证通过才保存
 */
export const VoiceConfigPanel: React.FC = () => {
  const { voiceApiKey, setVoiceApiKey, summaryThreshold, setSummaryThreshold } =
    useVoiceStore();
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [thresholdInput, setThresholdInput] = useState(
    String(summaryThreshold)
  );

  useEffect(() => {
    if (voiceApiKey) {
      setInputKey(voiceApiKey);
    }
  }, [voiceApiKey]);

  useEffect(() => {
    setThresholdInput(String(summaryThreshold));
  }, [summaryThreshold]);

  const MIN_THRESHOLD = 0;
  const MAX_THRESHOLD = 9999;

  /** 输入过程中实时保存：过滤非数字 → 校正范围 → 写 store */
  const handleThresholdChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits === '') {
      setThresholdInput('');
      return;
    }
    const v = parseInt(digits, 10);
    const clamped = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, v));
    setThresholdInput(String(clamped));
    setSummaryThreshold(clamped);
  };

  /** 失焦时回填空值为 0 */
  const handleThresholdBlur = () => {
    if (thresholdInput === '') {
      setThresholdInput('0');
      setSummaryThreshold(0);
    }
  };

  /**
   * 验证并保存 API Key：
   * 1. 用输入的 Key 调一次 synthesize 合成测试文本
   * 2. 验证通过：播放测试音频 + 保存 Key + 显示成功提示
   * 3. 验证失败：显示错误提示，不保存
   */
  const handleSave = async () => {
    const key = inputKey.trim();
    if (!key) {
      setFeedback({ type: 'error', message: '请输入 API Key' });
      return;
    }

    setFeedback(null);
    setVerifying(true);
    try {
      await synthesize(VERIFY_TEXT, 'male-qn-qingse', key);
      setVoiceApiKey(key);
      setFeedback({ type: 'success', message: 'API Key 验证通过，已保存' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '验证失败';
      setFeedback({ type: 'error', message });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-5 flex flex-col gap-4">
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
              onClick={handleSave}
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

      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-[#333] mb-3">语音参数</h3>
        <SettingRow
          label="语音摘要阈值"
          desc="当回复超过此字符数时，会自动将内容总结后再播放"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={thresholdInput}
              onChange={(e) => handleThresholdChange(e.target.value)}
              onBlur={handleThresholdBlur}
              className="w-24 h-8 px-3 text-[13px] border border-[#e0e0e0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#999]"
            />
            <span className="text-[12px] text-[#999]">字符</span>
          </div>
        </SettingRow>
      </div>
    </div>
  );
};
