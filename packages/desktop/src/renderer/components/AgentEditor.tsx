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
} from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import {
  listMcpServers,
  listSkills,
  listProviders,
  uploadAvatar,
  type McpServer,
  type Skill,
  type ProviderInfo,
} from '../lib/api';
import { ModelSelector } from './ModelSelector';
import { WorkspaceSelector } from './WorkspaceSelector';
import { AgentAvatar } from './AgentAvatar';
import { SettingRow, SettingDivider } from './SettingRow';
import { ScrollArea } from './ui/ScrollArea';
import { Input } from './ui/Input';
import type { CreateAgentInput, UpdateAgentInput, Agent } from '../types/agent';
import { logger } from '../lib/logger';
import { PRESET_VOICES, synthesize } from '../lib/tts';
import { audioPlayer } from '../lib/audio-player';
import { useVoiceStore } from '../stores/voiceStore';
import { toast } from '../stores/toastStore';

const PREVIEW_TEXTS = [
  '你好呀，很高兴见到你，今天有什么我可以帮忙的吗？',
  '关于这个问题，我觉得可以从几个方面来看，让我慢慢给你说。',
  '一切都会好起来的，我会一直在这里陪你。',
  '早上好呀！新的一天开始了，希望你今天过得愉快。',
];

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

  const [previewDataUrl, setPreviewDataUrl] = useState<string | undefined>();
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<string>('deepseek');
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [maxSteps, setMaxSteps] = useState('10');
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<
    string | undefined
  >();
  const [voiceId, setVoiceId] = useState<string>('');
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
      const [mcpData, skillData, providerData] = await Promise.all([
        listMcpServers(),
        listSkills(),
        listProviders(),
      ]);
      setMcps(mcpData);
      setSkills(skillData);
      setProviders(providerData);
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
    setMaxSteps('10');
    setDefaultWorkspacePath(undefined);
    setPreviewDataUrl(undefined);
    setPendingAvatarFile(null);
    setVoiceId('');
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
   * 试听选中的音色：合成一段包含音色名称的试听文本并播放
   * 使用 getState() 而非 hook 读取 API Key，避免不必要的 store 订阅
   */
  const handlePreviewVoice = async () => {
    const apiKey = useVoiceStore.getState().voiceApiKey;
    if (!apiKey) {
      toast.warning('请先在设置中配置 MiniMax API Key');
      return;
    }

    try {
      setIsPreviewPlaying(true);
      const previewText =
        PREVIEW_TEXTS[Math.floor(Math.random() * PREVIEW_TEXTS.length)];
      const audio = await synthesize(previewText, voiceId, apiKey);
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
          maxSteps: parseInt(maxSteps) || 10,
          defaultWorkspacePath,
          voiceId: voiceId || undefined,
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
          maxSteps: parseInt(maxSteps) || 10,
          defaultWorkspacePath,
          voiceId: voiceId || undefined,
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
    maxSteps: parseInt(maxSteps) || 10,
    mcpNames: selectedMcpIds,
    skillNames: selectedSkillIds,
    defaultWorkspacePath,
    voiceId: voiceId || undefined,
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
                <SettingRow label="最大步数">
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

              {/* 语音配置 */}
              <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
                <h3 className="text-[14px] font-bold text-[#333] mb-3">
                  <Speech className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[#999]" />
                  语音配置
                </h3>
                <SettingRow
                  label="朗读音色"
                  desc="选择后，Agent 回复时将使用该音色朗读"
                >
                  <select
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="rounded-lg border border-[#e0e0e0] h-8 w-48 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">不启用语音</option>
                    {PRESET_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                {voiceId && (
                  <div className="mt-2">
                    <button
                      onClick={handlePreviewVoice}
                      disabled={isPreviewPlaying}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e0e0e0] rounded-lg text-[13px] text-[#666] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Volume2 className="w-4 h-4" />
                      {isPreviewPlaying ? '试听中...' : '试听音色'}
                    </button>
                  </div>
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
