/**
 * @file src/renderer/components/AgentEditor.tsx
 * @description Agent 编辑面板，支持创建和编辑 Agent，包括基本信息、模型配置、工作空间、MCP、Skills 分配和语音配置
 */
import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Settings,
  Zap,
  Plus,
  Wrench,
  Trash2,
  FolderOpen,
  Upload,
  Volume2,
} from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
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
  isOpen: boolean;
  editingAgentId: string | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

/**
 * Agent 编辑面板组件，以右侧抽屉形式展示，支持创建新 Agent 或编辑已有 Agent
 * @param props.isOpen - 面板是否打开
 * @param props.editingAgentId - 正在编辑的 Agent ID，为 null 时进入新建模式
 * //TODO: 这个面板以后要换成单独的界面
 * @param props.onClose - 关闭面板回调
 * @param props.onDelete - 删除 Agent 回调
 */
export const AgentEditor: React.FC<AgentEditorProps> = ({
  isOpen,
  editingAgentId,
  onClose,
  onDelete,
}) => {
  const {
    agents,
    createNewAgent,
    updateAgentById,
    setAvatarPreview,
    removeAvatarPreview,
  } = useAgentStore();
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
  const [maxSteps, setMaxSteps] = useState(10);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<
    string | undefined
  >();
  const [voiceId, setVoiceId] = useState<string>('');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const [showMcpDropdown, setShowMcpDropdown] = useState(false);
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadOptions();
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingAgent) {
      setName(editingAgent.name);
      setDescription(editingAgent.description || '');
      setProvider(editingAgent.defaultModel.provider);
      setModelId(editingAgent.defaultModel.model);
      setSystemPrompt(editingAgent.systemPrompt);
      setSelectedMcpIds(editingAgent.mcpNames);
      setSelectedSkillIds(editingAgent.skillNames);
      setMaxSteps(editingAgent.maxSteps);
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
    setMaxSteps(10);
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
          maxSteps,
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
          maxSteps,
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

      onClose();
    } catch (error) {
      logger.error('Failed to save agent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /** 删除当前编辑的 Agent 并关闭面板 */
  const handleDelete = () => {
    if (editingAgentId && onDelete) {
      onDelete(editingAgentId);
      onClose();
    }
  };

  const previewAgent: Agent = {
    id: editingAgentId || 'preview',
    name: name || 'A',
    description,
    systemPrompt,
    defaultModel: { provider, model: modelId },
    maxSteps,
    mcpNames: selectedMcpIds,
    skillNames: selectedSkillIds,
    defaultWorkspacePath,
    voiceId: voiceId || undefined,
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-medium">
            {editingAgentId ? '编辑 Agent' : '添加 Agent'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <User className="w-4 h-4" />
                基本信息
              </div>

              <div className="mb-4">
                <label className="text-xs text-gray-500 block mb-2">头像</label>
                <div className="flex items-start gap-4">
                  <AgentAvatar
                    agent={previewAgent}
                    size="lg"
                    editingPreviewUrl={previewDataUrl}
                  />
                  <div className="flex-1">
                    <label className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-600 cursor-pointer hover:bg-gray-50 w-fit">
                      <Upload className="w-4 h-4" />
                      上传头像
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label className="text-xs text-gray-500 block mb-1">
                  名称 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="给 Agent 起个名字"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  角色描述
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话描述这个 Agent 的职责"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Volume2 className="w-4 h-4" />
                语音配置
              </div>

              <div className="mb-3">
                <label className="text-xs text-gray-500 block mb-1">
                  朗读音色
                </label>
                <select
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">不启用语音</option>
                  {PRESET_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  选择后，Agent 回复时将使用该音色朗读
                </p>
              </div>

              {voiceId && (
                <button
                  onClick={handlePreviewVoice}
                  disabled={isPreviewPlaying}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Volume2 className="w-4 h-4" />
                  {isPreviewPlaying ? '试听中...' : '试听音色'}
                </button>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Settings className="w-4 h-4" />
                模型配置
              </div>

              <div className="mb-3">
                <label className="text-xs text-gray-500 block mb-1">
                  默认模型
                </label>
                <ModelSelector
                  providers={providers}
                  value={modelId}
                  onChange={setModelId}
                  providerValue={provider}
                  onProviderChange={handleProviderChange}
                  showOnlyVerified={true}
                />
              </div>

              <div className="mb-3">
                <label className="text-xs text-gray-500 block mb-1">
                  System Prompt
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="定义 Agent 的角色和行为规范..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  最大步数
                </label>
                <input
                  type="number"
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(parseInt(e.target.value) || 10)}
                  min={1}
                  max={50}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <FolderOpen className="w-4 h-4" />
                工作空间
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  默认工作空间
                </label>
                <WorkspaceSelector
                  value={defaultWorkspacePath}
                  onChange={setDefaultWorkspacePath}
                  placeholder="选择默认工作空间文件夹"
                />
                <p className="text-xs text-gray-400 mt-1">
                  创建新会话时将使用此工作空间
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Wrench className="w-4 h-4" />
                MCP 分配
              </div>

              <div className="border rounded-lg p-3 mb-3">
                <div className="text-xs text-gray-500 mb-2">
                  已选择{' '}
                  <span className="bg-blue-100 text-blue-700 px-1.5 rounded">
                    {selectedMcpIds.length}
                  </span>
                </div>
                {selectedMcpIds.length === 0 ? (
                  <div className="text-gray-400 text-xs py-4 text-center">
                    点击下方按钮添加 MCP
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedMcpIds.map((mcpId) => {
                      const mcp = mcps.find((m) => m.name === mcpId);
                      return (
                        <div
                          key={mcpId}
                          className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-sm"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${mcp?.status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                          <span>{mcpId}</span>
                          <button
                            onClick={() => removeMcp(mcpId)}
                            className="hover:bg-gray-200 rounded p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowMcpDropdown(!showMcpDropdown)}
                  className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  添加 MCP
                </button>
                {showMcpDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {availableMcps.length === 0 ? (
                      <div className="px-3 py-2 text-gray-400 text-xs">
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
                            className={`w-2 h-2 rounded-full ${mcp.status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                          <div>
                            <div className="text-sm">{mcp.name}</div>
                            <div className="text-xs text-gray-400">
                              {mcp.status}{' '}
                              {mcp.toolCount ? `· ${mcp.toolCount} tools` : ''}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Zap className="w-4 h-4" />
                Skills 分配
              </div>

              <div className="border rounded-lg p-3 mb-3">
                <div className="text-xs text-gray-500 mb-2">
                  已选择{' '}
                  <span className="bg-blue-100 text-blue-700 px-1.5 rounded">
                    {selectedSkillIds.length}
                  </span>
                </div>
                {selectedSkillIds.length === 0 ? (
                  <div className="text-gray-400 text-xs py-4 text-center">
                    点击下方按钮添加 Skill
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedSkillIds.map((skillId) => {
                      const skill = skills.find((s) => s.name === skillId);
                      return (
                        <div
                          key={skillId}
                          className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-sm"
                        >
                          <span>{skill?.name || skillId}</span>
                          <button
                            onClick={() => removeSkill(skillId)}
                            className="hover:bg-gray-200 rounded p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowSkillDropdown(!showSkillDropdown)}
                  className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  添加 Skill
                </button>
                {showSkillDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {availableSkills.length === 0 ? (
                      <div className="px-3 py-2 text-gray-400 text-xs">
                        没有可添加的 Skill
                      </div>
                    ) : (
                      availableSkills.map((skill) => (
                        <button
                          key={skill.name}
                          onClick={() => addSkill(skill.name)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <div className="text-sm">{skill.name}</div>
                          {skill.description && (
                            <div className="text-xs text-gray-400">
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
        </div>

        <div className="px-4 py-3 border-t flex justify-between">
          <div>
            {editingAgentId && (
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-md text-sm flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 border border-gray-200 rounded-md text-sm hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || isLoading}
              className="px-4 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '保存中...' : editingAgentId ? '保存' : '添加'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
