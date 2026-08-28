/**
 * @fileoverview 首次启动引导向导（Landing）。
 *
 * 三页模态（70vw × 70vh，圆点在顶部），每页持久 header + footer，中间区域同框切换：
 * P1 密钥与模型（供应商画廊 ⇄ key 表单）→ P2 身份/提示词/语音 → P3 能力概念介绍。
 * 唯一出口 P3「开始对话」：一次 PUT 落盘身份/语音（defaultModel 仅本次验证通过才带）
 * + 写 landing-completed 标记，由 App 关闭向导并切入聊天。
 * 供应商与设置页共用同一数据源（GET /api/providers），品牌图标走 ProviderMark/ModelMark。
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Loader2,
  Volume2,
  ChevronLeft,
  PenLine,
  FileText,
  Sparkles,
  Wrench,
  LayoutGrid,
  Save,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentConfigUpdate, ProviderStatus } from '@persona/shared';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';
import {
  getAgent,
  updateAgent,
  getVoices,
  getTtsConfig,
  updateTtsConfig,
  verifyCredential,
  setCredential,
  getAgentAvatarUrl,
  type VoiceOption,
} from '../../lib/api';
import { getRandomPreviewText } from '../../lib/utils';
import { toast } from '../../stores/toastStore';
import { useProviderStore } from '../../stores/providerStore';
import { useVoicePreview } from '../../hooks/useVoicePreview';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { PasswordInput } from '../ui/PasswordInput';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { SettingRow } from '../common/SettingRow';
import { ProviderMark, ModelMark } from '../common/ProviderMark';

const PAGE_COUNT = 3;

const VOICE_LANGUAGES = [
  { value: 'default', key: 'landing.langDefault' },
  { value: 'zh', key: 'landing.langZh' },
  { value: 'en', key: 'landing.langEn' },
  { value: 'ja', key: 'landing.langJa' },
];

/** P3 概念块图标映射：Agent App 用与商城 tab 一致的 LayoutGrid */
const CONCEPT_ICONS = { wrench: Wrench, sparkles: Sparkles, app: LayoutGrid };

/** P3 概念块：只解释 MCP 工具/Agent 技能/Agent App 是什么，不列具体条目（零网络） */
const CONCEPT_ROWS = [
  { id: 'tool', icon: 'wrench' },
  { id: 'skill', icon: 'sparkles' },
  { id: 'app', icon: 'app' },
] as const;

/**
 * key 获取地址提示行（ProviderStatus 不携带，静态维护与设置页供应商白名单对齐）。
 */
const KEY_URLS: Record<string, string> = {
  anthropic: 'console.anthropic.com/settings/keys',
  google: 'aistudio.google.com/apikey',
  openai: 'platform.openai.com/api-keys',
  groq: 'console.groq.com/keys',
  openrouter: 'openrouter.ai/keys',
  zai: 'open.bigmodel.cn/usercenter/apikeys',
  minimax: 'platform.minimaxi.com/user-center/basic-information/interface-key',
  'minimax-cn':
    'platform.minimaxi.com/user-center/basic-information/interface-key',
  'kimi-coding': 'platform.moonshot.cn/console/api-keys',
  deepseek: 'platform.deepseek.com/api_keys',
  huggingface: 'huggingface.co/settings/tokens',
  'openai-codex': 'platform.openai.com/api-keys',
  moonshotai: 'platform.moonshot.ai/console/api-keys',
  'moonshotai-cn': 'platform.moonshot.cn/console/api-keys',
};

interface LandingWizardProps {
  /** 播种出的初始 Agent ID（PUT 对象） */
  agentId: string;
  /** 唯一出口完成回调：App 负责关向导、切 Agent 进聊天 */
  onComplete: () => void;
}

export function LandingWizard({ agentId, onComplete }: LandingWizardProps) {
  const { t } = useTranslation();
  const [step, setPage] = useState(0);

  // P1：密钥与模型（null = 画廊态，否则为该供应商的 key 表单态）
  const providers = useProviderStore((s) => s.providers);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keyVerified, setKeyVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [modelId, setModelId] = useState('');
  const [skipConfirm, setSkipConfirm] = useState(false);

  // P2：身份/提示词/语音（预填 = 播种 Agent 现值）
  const [profile, setProfile] = useState({
    name: '',
    desc: '',
    systemPrompt: '',
  });
  const [avatarUrl, setAvatarUrl] = useState('');
  const [voiceId, setVoiceId] = useState('Chinese (Mandarin)_Gentle_Senior');
  const [voiceLanguage, setVoiceLanguage] = useState('default');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [ttsKeyConfigured, setTtsKeyConfigured] = useState(false);
  const [ttsKey, setTtsKey] = useState('');
  const [savingTts, setSavingTts] = useState(false);
  const { playingId: previewingVoiceId, preview: previewVoice } =
    useVoicePreview();

  /** 挂载即取播种 Agent 现值、音色列表与 TTS 配置状态（任一失败不阻塞向导） */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const agent = await getAgent(agentId);
        if (cancelled) return;
        setProfile({
          name: agent.name,
          desc: agent.description ?? '',
          systemPrompt: agent.systemPrompt,
        });
        if (agent.voiceId) setVoiceId(agent.voiceId);
        if (agent.voiceLanguage) setVoiceLanguage(agent.voiceLanguage);
        setAvatarUrl(getAgentAvatarUrl(agentId));
      } catch (err) {
        logger.error('[Landing] failed to load seeded agent:', err);
      }
      try {
        const vs = await getVoices();
        if (!cancelled) setVoices(vs);
      } catch {
        /* 音色列表失败时仅剩当前值可保持 */
      }
      try {
        const config = await getTtsConfig();
        if (!cancelled) setTtsKeyConfigured(!!config.apiKey);
      } catch {
        /* TTS 状态失败按未配置处理 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const provider = providers.find((p) => p.id === selectedProvider);
  // P1 只为初始 Agent 配一家：仅本次验证通过才可继续（设置页已有的已配置状态不放宽门控）
  const canNext = keyVerified;

  /** 进入某供应商表单：模型预填该供应商列表第一项 */
  const openProvider = (p: ProviderStatus) => {
    setSelectedProvider(p.id);
    setKeyVerified(false);
    setApiKey('');
    setModelId(p.models[0] ?? '');
    setSkipConfirm(false);
  };

  /** 一键 verify + save：verifyCredential 通过后 setCredential 落盘 config/auth.json */
  const handleVerifyKey = async () => {
    if (!provider || !apiKey.trim() || verifying) return;
    setVerifying(true);
    try {
      const result = await verifyCredential(provider.id, apiKey.trim());
      if (!result.valid) {
        toast.error(result.error ?? t('landing.verifyFailed'));
        return;
      }
      await setCredential(provider.id, apiKey.trim());
      setKeyVerified(true);
      logger.info(`[Landing] credential saved for provider: ${provider.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('landing.verifyFailed')
      );
    } finally {
      setVerifying(false);
    }
  };

  /** TTS 轻量配置：保存即生效（全局服务配置，不走 Agent PUT） */
  const handleSaveTtsKey = async () => {
    if (!ttsKey.trim() || savingTts) return;
    setSavingTts(true);
    try {
      await updateTtsConfig({ apiKey: ttsKey.trim() });
      setTtsKeyConfigured(true);
      toast.success(t('common.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setSavingTts(false);
    }
  };

  /** 唯一出口：一次 PUT 落盘身份/语音（defaultModel 仅本次验证过才带）+ 写完成标记 */
  const finish = async () => {
    try {
      const update: AgentConfigUpdate = {
        name: profile.name,
        description: profile.desc,
        systemPrompt: profile.systemPrompt,
        voiceId,
        voiceLanguage,
      };
      if (keyVerified && provider) {
        update.defaultModel = { provider: provider.id, model: modelId };
      }
      await updateAgent(agentId, update);
      logger.info(`[Landing] wizard complete, agent updated: ${agentId}`);
    } catch (err) {
      // PUT 失败保留播种默认值继续放行，避免向导死循环；用户可稍后在 Agent 编辑器修改
      logger.error('[Landing] failed to update agent:', err);
      toast.error(t('common.saveFailed'));
    } finally {
      localStorage.setItem('landing-completed', 'true');
      onComplete();
    }
  };

  const dots = (
    <div className="flex justify-center gap-2 mb-6 shrink-0">
      {Array.from({ length: PAGE_COUNT }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            i <= step ? 'bg-primary' : 'bg-muted-foreground/25'
          )}
        />
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center">
      {/* 固定尺寸：全程不缩放不换高（OpenWorker 铁律） */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
        className="w-[70vw] min-w-[640px] max-w-[1100px] h-[70vh] min-h-[640px] max-h-[85vh] rounded-2xl border border-border bg-white shadow-2xl p-8 flex flex-col"
        data-testid="landing-wizard"
      >
        {dots}

        {/* ---- P1 密钥与模型：header 持久，画廊 ⇄ 表单同框切换 ---- */}
        {step === 0 && (
          <section className="flex-1 min-h-0 flex flex-col">
            <h1 className="text-[19px] font-semibold text-foreground">
              {t('landing.welcomeTitle')}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5 mb-4">
              {t('landing.welcomeSub')}
            </p>

            {!provider ? (
              /* 供应商画廊：单列滚动列表（全量与设置页同源），行卡 = 图标 + 名称 + 状态 */
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="flex flex-col gap-2">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2 text-left hover:border-primary/50 transition-colors"
                      onClick={() => openProvider(p)}
                    >
                      <ProviderMark providerId={p.id} name={p.name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-tight truncate text-foreground">
                          {p.name}
                        </span>
                        {p.hasAuth ? (
                          <span className="block text-[11.5px] text-emerald-600">
                            ✓ {t('landing.configured')}
                          </span>
                        ) : (
                          <span className="block text-[11.5px] text-muted-foreground">
                            {t('landing.notConfigured')}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground/50 text-[14px]">
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* 单个供应商的 key 表单：同一个框内切换，模型为该供应商自己的列表 */
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                <button
                  className="text-[12.5px] leading-none text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1"
                  onClick={() => setSelectedProvider(null)}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {t('landing.backToGallery')}
                </button>

                <div className="flex items-center gap-2.5 mb-1">
                  <ProviderMark
                    providerId={provider.id}
                    name={provider.name}
                    size={36}
                  />
                  <span className="text-[15px] font-semibold text-foreground">
                    {provider.name}
                  </span>
                </div>

                <label className="block text-[12px] text-muted-foreground mt-4 mb-1.5">
                  {t('landing.apiKeyLabel')}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <PasswordInput
                      className="w-full h-9 text-[13.5px]"
                      placeholder={t('landing.apiKeyPlaceholder', {
                        name: provider.name,
                      })}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setKeyVerified(false);
                      }}
                    />
                  </div>
                  <button
                    className="shrink-0 px-4 h-9 rounded-full border border-border text-[13px] font-medium text-foreground hover:border-primary/60 disabled:opacity-40 transition-colors"
                    disabled={!apiKey.trim() || verifying || keyVerified}
                    onClick={() => void handleVerifyKey()}
                  >
                    {verifying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                    ) : keyVerified ? (
                      <Check className="w-3.5 h-3.5 inline mr-1" />
                    ) : null}
                    {verifying
                      ? t('landing.verifying')
                      : keyVerified
                        ? t('landing.verified')
                        : t('landing.verifySave')}
                  </button>
                </div>
                {keyVerified && (
                  <p className="text-[12px] text-emerald-600 mt-1.5">
                    ✓ {t('landing.keySaved', { name: provider.name })}
                  </p>
                )}
                {KEY_URLS[provider.id] && (
                  <p className="text-[11px] text-muted-foreground/70 mt-2">
                    {t('landing.keyHelp', {
                      url: KEY_URLS[provider.id],
                    })}
                  </p>
                )}

                <label className="block text-[12px] text-muted-foreground mt-4 mb-1.5">
                  {t('landing.modelLabel')}
                </label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger className="w-full h-9 text-[13.5px]">
                    {/* SelectValue 显式 children 覆盖选中项 ItemText 的镜像，避免 trigger 与选项各渲染一个图标 */}
                    <SelectValue>
                      <span className="flex items-center gap-2 min-w-0">
                        <ModelMark
                          modelId={modelId}
                          providerId={provider.id}
                          name={provider.name}
                          size={18}
                        />
                        <span className="truncate">{modelId}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {provider.models.map((m) => (
                      <SelectItem key={m} value={m}>
                        <span className="flex items-center gap-2">
                          <ModelMark
                            modelId={m}
                            providerId={provider.id}
                            name={provider.name}
                            size={18}
                          />
                          {m}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 持久 footer：左侧跳过（两态），右侧继续 */}
            <div className="flex items-center gap-3 pt-5">
              {!skipConfirm ? (
                <button
                  className="text-[12.5px] text-muted-foreground/70 hover:text-muted-foreground"
                  onClick={() => setSkipConfirm(true)}
                >
                  {t('landing.skipSetup')}
                </button>
              ) : (
                <span className="text-[12.5px] text-muted-foreground">
                  {t('landing.skipConsequence')}{' '}
                  <button
                    className="text-primary underline underline-offset-2"
                    onClick={() => {
                      setSelectedProvider(null);
                      setSkipConfirm(false);
                      setPage(1);
                    }}
                  >
                    {t('landing.skipAnyway')}
                  </button>
                </span>
              )}
              <Button
                className="ml-auto h-9 px-6 text-[13px]"
                disabled={!canNext || verifying}
                onClick={() => setPage(1)}
              >
                {t('landing.next')}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-3">
              {t('landing.p1Hint')}
            </p>
          </section>
        )}

        {/* ---- P2 身份与提示词：两张卡（AgentEditor 卡片形态），定高不滚动 ---- */}
        {step === 1 && (
          <section className="flex-1 min-h-0 flex flex-col">
            <h1 className="text-[19px] font-semibold text-foreground">
              {t('landing.identityTitle')}
            </h1>

            <div className="flex-1 min-h-0 flex flex-col gap-3 mt-3.5 overflow-y-auto">
              {/* 卡片1 身份：头像+名字/简介，音色与朗读语言（AgentEditor 基本信息区+音色区合并） */}
              <div className="rounded-xl border border-border bg-white px-4 py-3.5">
                <div className="flex items-center mb-3">
                  <h3 className="text-[14px] font-bold text-foreground flex items-center gap-1.5">
                    <PenLine className="w-4 h-4 text-muted-foreground -mt-0.5" />
                    {t('landing.identityCard')}
                  </h3>
                </div>

                <div className="flex items-start gap-4">
                  {avatarUrl && (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover border border-border shrink-0"
                    />
                  )}
                  {/* 标签列自适应最宽标签，避免长标签溢出，两行输入框左缘对齐 */}
                  <div className="flex-1 min-w-0 grid grid-cols-[max-content_1fr] items-center gap-x-2.5 gap-y-2.5">
                    <span className="text-[13px] text-muted-foreground">
                      {t('landing.nameLabel')}
                    </span>
                    <input
                      className="h-8 rounded-lg border border-border px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={profile.name}
                      onChange={(e) =>
                        setProfile({ ...profile, name: e.target.value })
                      }
                    />
                    <span className="text-[13px] text-muted-foreground">
                      {t('landing.descLabel')}
                    </span>
                    <input
                      className="h-8 rounded-lg border border-border px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={profile.desc}
                      onChange={(e) =>
                        setProfile({ ...profile, desc: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="mt-4">
                  {/* 语音服务行：未配置时可轻量填 key（与 VoiceConfigPanel 同一 API），已配置显示绿字状态 */}
                  {ttsKeyConfigured ? (
                    <SettingRow label={t('landing.ttsServiceLabel')}>
                      <span className="text-[12px] text-emerald-600 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        {t('landing.ttsConfigured')}
                      </span>
                    </SettingRow>
                  ) : (
                    <SettingRow label={t('landing.ttsServiceLabel')}>
                      <div className="flex items-center gap-2">
                        <PasswordInput
                          className="w-48 h-8 text-[13px]"
                          placeholder={t('landing.ttsKeyPlaceholder')}
                          value={ttsKey}
                          onChange={(e) => setTtsKey(e.target.value)}
                        />
                        {/* w-8 图标钮与音色行试听钮等宽，三行控件左右缘均对齐 */}
                        <button
                          onClick={() => void handleSaveTtsKey()}
                          disabled={!ttsKey.trim() || savingTts}
                          className="rounded-lg border border-border w-8 h-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {savingTts ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </SettingRow>
                  )}
                  {/* 无分隔线，用上边距保持行间距 */}
                  <div className="mt-2.5">
                    <SettingRow label={t('landing.voiceLabel')}>
                      <div className="flex items-center gap-2">
                        <Select value={voiceId} onValueChange={setVoiceId}>
                          <SelectTrigger className="w-48 h-8 text-[13px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {voices.filter((v) => v.group === 'cloned').length >
                              0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[11px] text-muted-foreground uppercase">
                                  {t('landing.clonedVoices')}
                                </SelectLabel>
                                {voices
                                  .filter((v) => v.group === 'cloned')
                                  .map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.name}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            )}
                            <SelectGroup>
                              <SelectLabel className="text-[11px] text-muted-foreground uppercase">
                                {t('landing.presetVoices')}
                              </SelectLabel>
                              {voices
                                .filter((v) => v.group === 'preset')
                                .map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {t(`voicePreset.${v.id}`)} ·{' '}
                                    {v.gender === 'male'
                                      ? t('landing.male')
                                      : v.gender === 'female'
                                        ? t('landing.female')
                                        : ''}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => {
                            const text = getRandomPreviewText(t);
                            previewVoice(voiceId, text, {
                              noKey: t('common.configureApiKeyInSettings'),
                              failed: t('common.previewFailed'),
                            });
                          }}
                          disabled={!voiceId || !!previewingVoiceId}
                          className="rounded-lg border border-border w-8 h-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {previewingVoiceId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </SettingRow>
                  </div>
                  <div className="mt-2.5">
                    <SettingRow label={t('landing.voiceLanguage')}>
                      {/* 尾部占位与音色行试听钮等宽，两个 Select 左右缘均对齐 */}
                      <div className="flex items-center gap-2">
                        <Select
                          value={voiceLanguage}
                          onValueChange={setVoiceLanguage}
                        >
                          <SelectTrigger className="w-48 h-8 text-[13px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VOICE_LANGUAGES.map((l) => (
                              <SelectItem key={l.value} value={l.value}>
                                {t(l.key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="w-8 shrink-0" aria-hidden />
                      </div>
                    </SettingRow>
                  </div>
                </div>
              </div>

              {/* 卡片2 系统提示词：撑满剩余高度 */}
              <div className="flex-1 min-h-0 rounded-xl border border-border bg-white px-4 py-3.5 flex flex-col">
                <h3 className="text-[14px] font-bold text-foreground flex items-center gap-1.5 mb-2">
                  <FileText className="w-4 h-4 text-muted-foreground -mt-0.5" />
                  {t('landing.promptCard')}
                </h3>
                <Textarea
                  className="flex-1 min-h-[120px] text-[13px] resize-none"
                  value={profile.systemPrompt}
                  onChange={(e) =>
                    setProfile({ ...profile, systemPrompt: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center pt-5">
              <button
                className="flex items-center gap-1 text-[12.5px] leading-none text-muted-foreground hover:text-foreground"
                onClick={() => setPage(0)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t('landing.back')}
              </button>
              <Button
                className="ml-auto h-9 px-6 text-[13px]"
                onClick={() => setPage(2)}
              >
                {t('landing.next')}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-3">
              {t('landing.p2Hint')}
            </p>
          </section>
        )}

        {/* ---- P3 能力概念介绍：不列条目、零网络，唯一出口「开始对话」 ---- */}
        {step === 2 && (
          <section className="flex-1 min-h-0 flex flex-col">
            <h1 className="text-[19px] font-semibold text-foreground">
              {t('landing.toolsTitle')}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5 mb-3">
              {t('landing.toolsSub')}
            </p>

            <div className="flex-1 min-h-0 flex flex-col justify-start gap-3 mt-1">
              {CONCEPT_ROWS.map(({ id, icon }) => {
                const Icon = CONCEPT_ICONS[icon];
                return (
                  <div
                    key={id}
                    className="rounded-xl border border-border bg-white px-4 py-3.5 flex items-start gap-3"
                  >
                    <span className="w-9 h-9 rounded-lg border border-border grid place-items-center shrink-0 text-muted-foreground">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className="block text-[13.5px] font-semibold leading-tight text-foreground mb-0.5">
                        {t(`landing.${id}ConceptTitle`)}
                      </span>
                      <span className="block text-[12.5px] text-muted-foreground leading-relaxed">
                        {t(`landing.${id}ConceptDesc`)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center mt-3.5">
              <button
                className="flex items-center gap-1 text-[12.5px] leading-none text-muted-foreground hover:text-foreground"
                onClick={() => setPage(1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t('landing.back')}
              </button>
              <Button
                className="ml-auto h-9 px-6 text-[13px]"
                onClick={() => void finish()}
              >
                {t('landing.finish')}
              </Button>
            </div>
          </section>
        )}
      </motion.div>
    </div>
  );
}
