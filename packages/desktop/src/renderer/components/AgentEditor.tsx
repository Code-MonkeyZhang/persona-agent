/**
 * @file src/renderer/components/AgentEditor.tsx
 * @description Agent 编辑全页面组件，支持创建和编辑 Agent，包括基本信息、模型配置、工作空间、MCP、Skills 分配和语音配置
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Plus,
  Camera,
  Volume2,
  X,
  PenLine,
  Plug,
  Sparkles,
  Brain,
  Speech,
  Folder,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import {
  listMcpServers,
  listSkills,
  listProviders,
  uploadAvatar,
  getVoices,
  getTtsConfig,
  type McpServer,
  type Skill,
  type ProviderInfo,
  type VoiceOption,
} from '../lib/api';
import { ModelSelector } from './ModelSelector';
import { WorkspaceSelector } from './WorkspaceSelector';
import { AgentAvatar } from './AgentAvatar';
import { SettingRow, SettingDivider } from './SettingRow';
import { ScrollArea } from './ui/ScrollArea';
import { Input } from './ui/Input';
import {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from './ui/Select';
import type { CreateAgentInput, UpdateAgentInput, Agent } from '../types/agent';
import { logger } from '../lib/logger';
import { synthesize } from '../lib/tts';
import { audioPlayer } from '../lib/audio-player';
import { toast } from '../stores/toastStore';

const PREVIEW_TEXTS = [
  '你好呀，很高兴见到你，今天有什么我可以帮忙的吗？',
  '今天天气真不错，适合出去走走呢。',
  '嗨，我是你的语音助手，有什么想聊的吗？',
];

const VOICE_LANGUAGES = [
  { value: 'default', label: 'Default（跟随原文）' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
] as const;

interface AgentEditorProps {
  editingAgentId: string | null;
  onDelete?: (id: string) => void;
}

/**
 * Agent 编辑全页面组件，以独立页面形式展示（与 SettingsPage 同级），支持创建新 Agent 或编辑已有 Agent
 * @param props.editingAgentId - 正在编辑的 Agent ID，为 null 时进入新建模式
 * @param props.onDelete - 删除 Agent 回调
 */
export const AgentEditor: React.FC<AgentEditorProps> = ({
  editingAgentId,
  onDelete,
}) => {
  const {
    agents,
    createNewAgent,
    updateAgentById,
    setAvatarPreview,
    removeAvatarPreview,
  } = useAgentStore();
  const closeAgentEditor = useViewStore((s) => s.closeAgentEditor);
  const editingAgent = editingAgentId
    ? agents.find((a) => a.id === editingAgentId)
    : null;

  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | undefined>();
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<string>('deepseek');
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [maxSteps, setMaxSteps] = useState('50');
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<
    string | undefined
  >();
  const [voiceId, setVoiceId] = useState<string>('');
  const [voiceLanguage, setVoiceLanguage] = useState('default');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const [showMcpDropdown, setShowMcpDropdown] = useState(false);
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (editingAgent) {
      setName(editingAgent.name);
      setDescription(editingAgent.description || '');
      setProvider(editingAgent.defaultModel.provider);
      setModelId(editingAgent.defaultModel.model);
      setSystemPrompt(editingAgent.systemPrompt);
      setSelectedMcpIds(editingAgent.mcpNames);
      setSelectedSkillIds(editingAgent.skillNames);
      setMaxSteps(String(editingAgent.maxSteps));
      setDefaultWorkspacePath(editingAgent.defaultWorkspacePath);
      setPreviewDataUrl(undefined);
      setVoiceId(editingAgent.voiceId || '');
      setVoiceLanguage(editingAgent.voiceLanguage || 'default');
    } else {
      resetForm();
    }
  }, [editingAgentId, editingAgent]);

  useEffect(() => {
    if (providers.length > 0 && modelId === '') {
      const firstProvider = providers[0];
      if (firstProvider && firstProvider.models.length > 0) {
        setProvider(firstProvider.id);
        setModelId(firstProvider.models[0]);
      }
    }
  }, [providers, modelId]);

  /** 并行加载 MCP 服务器列表、技能列表和 Provider 列表 */
  const loadOptions = async () => {
    try {
      const [mcpData, skillData, providerData, voicesData] = await Promise.all([
        listMcpServers(),
        listSkills(),
        listProviders(),
        getVoices(),
      ]);
      setMcps(mcpData);
      setSkills(skillData);
      setProviders(providerData);
      setVoices(voicesData);
    } catch (error) {
      logger.error('Failed to load options:', error);
    }
  };

  /** 将表单所有字段重置为默认值 */
  const resetForm = () => {
    setName('');
    setDescription('');
    setProvider('deepseek');
    setModelId('');
    setSystemPrompt('');
    setSelectedMcpIds([]);
    setSelectedSkillIds([]);
    setMaxSteps('50');
    setDefaultWorkspacePath(undefined);
    setPreviewDataUrl(undefined);
    setPendingAvatarFile(null);
    setVoiceId('');
    setVoiceLanguage('default');
  };

  /** 切换 Provider 时同步更新 modelId 为该 Provider 的第一个可用模型 */
  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const providerInfo = providers.find((p) => p.id === newProvider);
    if (providerInfo && providerInfo.models.length > 0) {
      setModelId(providerInfo.models[0]);
    }
  };

  const availableMcps = mcps.filter((m) => !selectedMcpIds.includes(m.name));
  const availableSkills = skills.filter(
    (s) => !selectedSkillIds.includes(s.name)
  );

  /** 将指定 MCP 添加到已选列表并关闭下拉菜单 */
  const addMcp = (mcpName: string) => {
    setSelectedMcpIds([...selectedMcpIds, mcpName]);
    setShowMcpDropdown(false);
  };

  /** 从已选 MCP 列表中移除指定项 */
  const removeMcp = (mcpName: string) => {
    setSelectedMcpIds(selectedMcpIds.filter((id) => id !== mcpName));
  };

  /** 将指定 Skill 添加到已选列表并关闭下拉菜单 */
  const addSkill = (skillId: string) => {
    setSelectedSkillIds([...selectedSkillIds, skillId]);
    setShowSkillDropdown(false);
  };

  /** 从已选 Skill 列表中移除指定项 */
  const removeSkill = (skillId: string) => {
    setSelectedSkillIds(selectedSkillIds.filter((id) => id !== skillId));
  };

  /** 处理头像文件上传，将图片转为 base64 预览并暂存原始文件 */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPreviewDataUrl(base64);
      setPendingAvatarFile(file);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /**
   * 试听选中的音色：从服务端获取配置后合成试听文本并播放
   */
  const handlePreviewVoice = async () => {
    try {
      const ttsConfig = await getTtsConfig();
      if (!ttsConfig.apiKey) {
        toast.warning('请先在设置中配置 MiniMax API Key');
        return;
      }

      setIsPreviewPlaying(true);
      const previewText =
        PREVIEW_TEXTS[Math.floor(Math.random() * PREVIEW_TEXTS.length)];
      const audio = await synthesize(
        previewText,
        voiceId,
        ttsConfig.apiKey,
        ttsConfig.model
      );
      audioPlayer.play(audio);
    } catch (err) {
      const message = err instanceof Error ? err.message : '试听失败';
      logger.error('[AgentEditor] Voice preview failed:', message);
      toast.error(message);
    } finally {
      setTimeout(() => setIsPreviewPlaying(false), 3000);
    }
  };

  /** 保存 Agent 配置：编辑模式下上传头像并更新，新建模式下创建后用本地预览立即显示再上传 */
  const handleSave = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      if (editingAgentId) {
        if (pendingAvatarFile) {
          await uploadAvatar(editingAgentId, pendingAvatarFile);
        }

        const input: UpdateAgentInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          defaultModel: { provider, model: modelId },
          systemPrompt,
          mcpNames: selectedMcpIds,
          skillNames: selectedSkillIds,
          maxSteps: parseInt(maxSteps) || 50,
          defaultWorkspacePath,
          voiceId: voiceId || undefined,
          voiceLanguage: voiceId ? voiceLanguage : undefined,
        };
        await updateAgentById(editingAgentId, input);
      } else {
        const input: CreateAgentInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          defaultModel: { provider, model: modelId },
          systemPrompt,
          mcpNames: selectedMcpIds,
          skillNames: selectedSkillIds,
          maxSteps: parseInt(maxSteps) || 50,
          defaultWorkspacePath,
          voiceId: voiceId || undefined,
          voiceLanguage: voiceId ? voiceLanguage : undefined,
        };
        const newAgent = await createNewAgent(input);

        if (newAgent && pendingAvatarFile && previewDataUrl) {
          setAvatarPreview(newAgent.id, previewDataUrl);
          await uploadAvatar(newAgent.id, pendingAvatarFile);
          removeAvatarPreview(newAgent.id);
        }
      }

      closeAgentEditor();
    } catch (error) {
      logger.error('Failed to save agent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /** 删除当前编辑的 Agent 并返回聊天页面 */
  const handleDelete = () => {
    if (editingAgentId && onDelete) {
      onDelete(editingAgentId);
      closeAgentEditor();
    }
  };

  const previewAgent: Agent = {
    id: editingAgentId || 'preview',
    name: name || 'A',
    description,
    systemPrompt,
    defaultModel: { provider, model: modelId },
    maxSteps: parseInt(maxSteps) || 50,
    mcpNames: selectedMcpIds,
    skillNames: selectedSkillIds,
    defaultWorkspacePath,
    voiceId: voiceId || undefined,
    voiceLanguage: voiceId ? voiceLanguage : undefined,
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#f7f7f7]">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-5 py-5">
            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={closeAgentEditor}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-[16px] font-bold text-[#333]">
                {editingAgentId ? '编辑 Agent' : '添加 Agent'}
              </h1>
            </div>

            <div className="flex flex-col gap-4">
              {/* 基本信息 */}
              <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
                <h3 className="text-[14px] font-bold text-[#333] mb-3">
                  <PenLine className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[#999]" />
                  基本信息
                </h3>
                <div className="flex items-start gap-4">
                  <div
                    className="relative group cursor-pointer shrink-0 pt-0.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <AgentAvatar
                      agent={previewAgent}
                      size="lg"
                      editingPreviewUrl={previewDataUrl}
                    />
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] text-[#999] shrink-0 w-12">
                        名称
                      </span>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="给 Agent 起个名字"
                        className="rounded-lg border-[#e0e0e0] h-8 flex-1 text-[13px]"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] text-[#999] shrink-0 w-12">
                        描述
                      </span>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="一句话描述 Agent 的职责"
                        className="rounded-lg border-[#e0e0e0] h-8 flex-1 text-[13px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 模型配置 */}
              <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
                <h3 className="text-[14px] font-bold text-[#333] mb-3">
                  <Brain className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[#999]" />
                  模型配置
                </h3>
                <SettingRow label="默认模型">
                  <ModelSelector
                    providers={providers}
                    value={modelId}
                    onChange={setModelId}
                    providerValue={provider}
                    onProviderChange={handleProviderChange}
                    showOnlyVerified={true}
                  />
                </SettingRow>
                <SettingDivider />
                <div>
                  <div className="text-[14px] text-[#333] leading-[18px] mb-2">
                    System Prompt
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="定义 Agent 的角色和行为规范..."
                    rows={5}
                    className="w-full rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <SettingDivider />
                <SettingRow label="Agent最大步数">
                  <input
                    type="number"
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(e.target.value)}
                    min={1}
                    max={50}
                    className="rounded-lg border border-[#e0e0e0] h-8 w-24 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </SettingRow>
              </div>

              {/* 音色 */}
              <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
                <h3 className="text-[14px] font-bold text-[#333] mb-3">
                  <Speech className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[#999]" />
                  音色
                </h3>
                <SettingRow label="选择音色" desc="选择 Agent 使用的语音音色">
                  <div className="flex items-center gap-2">
                    <Select
                      value={voiceId || '__none__'}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          setVoiceId('');
                          setVoiceLanguage('default');
                        } else {
                          setVoiceId(v);
                        }
                      }}
                    >
                      <SelectTrigger className="rounded-lg border-[#e0e0e0] h-8 w-48 text-[13px]">
                        <SelectValue placeholder="不启用语音" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">不启用语音</SelectItem>
                        {voices.filter((v) => v.group === 'cloned').length >
                          0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[11px] text-[#999] font-medium uppercase tracking-wide">
                              我的克隆音色
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
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel className="text-[11px] text-[#999] font-medium uppercase tracking-wide">
                            预设音色
                          </SelectLabel>
                          {voices
                            .filter((v) => v.group === 'preset')
                            .map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name} ·{' '}
                                {v.gender === 'male'
                                  ? '男'
                                  : v.gender === 'female'
                                    ? '女'
                                    : ''}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={handlePreviewVoice}
                      disabled={!voiceId || isPreviewPlaying}
                      className="rounded-lg border border-[#e0e0e0] w-8 h-8 shrink-0 flex items-center justify-center text-[#999] hover:text-[#333] hover:bg-[#f0f0f0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPreviewPlaying ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </SettingRow>
                {voiceId && (
                  <>
                    <SettingDivider />
                    <div className="flex items-center justify-between min-h-[32px] gap-4">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <div className="text-[14px] text-[#333] leading-[18px]">
                          TTS 朗读语言
                        </div>
                        <span className="relative group">
                          <HelpCircle className="w-3.5 h-3.5 text-[#999] cursor-help" />
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 w-56 px-3 py-2 text-[12px] text-[#666] bg-white border border-[#e0e0e0] rounded-lg shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10 pointer-events-none">
                            设置语音播报使用的语言。Default
                            表示跟随原文语言，不做翻译
                          </span>
                        </span>
                      </div>
                      <div className="shrink-0">
                        <Select
                          value={voiceLanguage}
                          onValueChange={setVoiceLanguage}
                        >
                          <SelectTrigger className="rounded-lg border-[#e0e0e0] h-8 w-48 text-[13px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VOICE_LANGUAGES.map((l) => (
                              <SelectItem key={l.value} value={l.value}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 工作空间 */}
              <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
                <h3 className="text-[14px] font-bold text-[#333] mb-3">
                  <Folder className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[#999]" />
                  工作空间
                </h3>
                <SettingRow
                  label="默认工作空间"
                  desc="创建新会话时将使用此工作空间"
                >
                  <WorkspaceSelector
                    value={defaultWorkspacePath}
                    onChange={setDefaultWorkspacePath}
                    placeholder="选择默认工作空间文件夹"
                  />
                </SettingRow>
              </div>

              {/* MCP 分配 */}
              <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
                <h3 className="text-[14px] font-bold text-[#333] mb-3">
                  <Plug className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[#999]" />
                  MCP 分配
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {selectedMcpIds.map((mcpId) => {
                    const mcp = mcps.find((m) => m.name === mcpId);
                    const statusColor =
                      mcp?.status === 'connected'
                        ? 'bg-green-500'
                        : 'bg-gray-300';
                    return (
                      <div
                        key={mcpId}
                        className="group relative flex items-center gap-2.5 px-3 py-3 rounded-xl border border-[#eee] bg-[#fafafa] hover:bg-[#f5f5f5] transition-all text-left"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-[#333] truncate">
                            {mcpId}
                          </div>
                          <div className="text-[11px] text-[#999] truncate">
                            {mcp?.toolCount
                              ? `${mcp.toolCount} tools`
                              : '未连接'}
                          </div>
                        </div>
                        <button
                          onClick={() => removeMcp(mcpId)}
                          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10"
                        >
                          <X className="w-3 h-3 text-[#999]" />
                        </button>
                      </div>
                    );
                  })}
                  <div className="relative flex">
                    <button
                      onClick={() => setShowMcpDropdown(!showMcpDropdown)}
                      className="w-full px-3 py-3 border border-dashed border-[#d0d0d0] rounded-xl text-[13px] text-[#999] hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      添加 MCP
                    </button>
                    {showMcpDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8e8e8] rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                        {availableMcps.length === 0 ? (
                          <div className="px-3 py-2 text-[#ccc] text-[12px]">
                            没有可添加的 MCP
                          </div>
                        ) : (
                          availableMcps.map((mcp) => (
                            <button
                              key={mcp.name}
                              onClick={() => addMcp(mcp.name)}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                            >
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${mcp.status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`}
                              />
                              <div className="min-w-0">
                                <div className="text-[13px]">{mcp.name}</div>
                                <div className="text-[11px] text-[#999]">
                                  {mcp.toolCount
                                    ? `${mcp.toolCount} tools`
                                    : mcp.status === 'connected'
                                      ? 'connected'
                                      : 'disconnected'}
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Skills 分配 */}
              <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
                <h3 className="text-[14px] font-bold text-[#333] mb-3">
                  <Sparkles className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[#999]" />
                  Skills 分配
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {selectedSkillIds.map((skillId) => {
                    const skill = skills.find((s) => s.name === skillId);
                    return (
                      <div
                        key={skillId}
                        className="group relative flex items-center gap-2.5 px-3 py-3 rounded-xl border border-[#eee] bg-[#fafafa] hover:bg-[#f5f5f5] transition-all text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-[#333] truncate">
                            {skill?.name || skillId}
                          </div>
                          <div className="text-[11px] text-[#999] truncate">
                            {skill?.description || ''}
                          </div>
                        </div>
                        <button
                          onClick={() => removeSkill(skillId)}
                          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10"
                        >
                          <X className="w-3 h-3 text-[#999]" />
                        </button>
                      </div>
                    );
                  })}
                  <div className="relative flex">
                    <button
                      onClick={() => setShowSkillDropdown(!showSkillDropdown)}
                      className="w-full px-3 py-3 border border-dashed border-[#d0d0d0] rounded-xl text-[13px] text-[#999] hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      添加 Skill
                    </button>
                    {showSkillDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8e8e8] rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                        {availableSkills.length === 0 ? (
                          <div className="px-3 py-2 text-[#ccc] text-[12px]">
                            没有可添加的 Skill
                          </div>
                        ) : (
                          availableSkills.map((skill) => (
                            <button
                              key={skill.name}
                              onClick={() => addSkill(skill.name)}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50"
                            >
                              <div className="text-[13px]">{skill.name}</div>
                              {skill.description && (
                                <div className="text-[11px] text-[#999]">
                                  {skill.description}
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 底部操作 */}
              <div className="flex justify-between items-center pt-1 pb-6">
                <div>
                  {editingAgentId && (
                    <button
                      onClick={handleDelete}
                      className="text-[12px] text-[#ccc] hover:text-red-400 transition-colors"
                    >
                      删除此 Agent
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={closeAgentEditor}
                    className="rounded-lg border border-[#e0e0e0] h-8 px-5 text-[13px] hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!name.trim() || isLoading}
                    className="bg-[#222] text-white hover:bg-[#333] rounded-lg h-8 px-5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? '保存中...' : editingAgentId ? '保存' : '添加'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
