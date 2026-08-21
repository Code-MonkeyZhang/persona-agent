/**
 * @file src/renderer/components/agent-editor/AgentEditor.tsx
 * @description Agent 编辑全页面组件，负责状态编排与保存流程，各配置分区拆分至同目录子卡片
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentStore } from '../../stores/agentStore';
import { useViewStore } from '../../stores/viewStore';
import {
  listProviders,
  getVoices,
  uploadAvatar,
  uploadPoseImage,
  deletePoseImage,
  renamePoseImage,
  uploadBackgroundImage,
  deleteBackgroundImage,
  listPoses,
  getBackgroundImageUrl,
  type ProviderStatus,
  type VoiceOption,
} from '../../lib/api';
import { ScrollArea } from '../ui/ScrollArea';
import { BackButton } from '../ui/BackButton';
import type {
  AgentConfigInput,
  AgentConfigUpdate,
  AgentConfig,
} from '../../types/agent';
import { logger } from '../../lib/logger';
import { BasicInfoCard } from './BasicInfoCard';
import { AppearanceCard } from './AppearanceCard';
import { ModelConfigCard } from './ModelConfigCard';
import { ChatConfigCard } from './ChatConfigCard';
import { VoiceCard } from './VoiceCard';
import { WorkspaceCard } from './WorkspaceCard';
import type { PoseImage } from './PoseImageCardList';

interface AgentEditorProps {
  editingAgentId: string | null;
  onDelete?: (id: string) => void;
}

/**
 * Agent 编辑全页面组件，以独立页面形式展示，支持创建新 Agent 或编辑已有 Agent
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
  const { t } = useTranslation();
  const closeAgentEditor = useViewStore((s) => s.closeAgentEditor);
  const editingAgent = editingAgentId
    ? agents.find((a) => a.id === editingAgentId)
    : null;

  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | undefined>();
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<string>('deepseek');
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxSteps, setMaxSteps] = useState('50');
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<
    string | undefined
  >();
  const [voiceId, setVoiceId] = useState<string>('');
  const [voiceLanguage, setVoiceLanguage] = useState('default');
  const [compressionThreshold, setCompressionThreshold] = useState('50');
  const [dreamIntervalMinutes, setDreamIntervalMinutes] = useState('120');

  const [isLoading, setIsLoading] = useState(false);

  const [poseImages, setPoseImages] = useState<PoseImage[]>([]);
  const [pendingBgFile, setPendingBgFile] = useState<File | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | undefined>();
  const [bgDeleted, setBgDeleted] = useState(false);

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
      setMaxSteps(String(editingAgent.maxSteps));
      setDefaultWorkspacePath(editingAgent.defaultWorkspacePath);
      setPreviewDataUrl(undefined);
      setVoiceId(editingAgent.voiceId || '');
      setVoiceLanguage(editingAgent.voiceLanguage || 'default');
      setCompressionThreshold(String(editingAgent.compressionThreshold ?? 50));
      setDreamIntervalMinutes(String(editingAgent.dreamIntervalMinutes ?? 120));
      loadPoseImages(editingAgent.id);
      setBgPreviewUrl(getBackgroundImageUrl(editingAgent.id));
      setBgDeleted(false);
      setPendingBgFile(null);
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

  /** 并行加载 Provider 列表和音色列表 */
  const loadOptions = async () => {
    try {
      const [providerData, voicesData] = await Promise.all([
        listProviders(),
        getVoices(),
      ]);
      setProviders(providerData);
      setVoices(voicesData);
    } catch (error) {
      logger.error('Failed to load options:', error);
    }
  };

  /** 加载已有 Agent 的立绘列表 */
  const loadPoseImages = async (agentId: string) => {
    try {
      const poses = await listPoses(agentId);
      setPoseImages(
        poses.map((name) => ({ name, status: 'existing' as const }))
      );
    } catch (error) {
      logger.error('Failed to load pose images:', error);
      setPoseImages([]);
    }
  };

  /** 将表单所有字段重置为默认值 */
  const resetForm = () => {
    setName('');
    setDescription('');
    setProvider('deepseek');
    setModelId('');
    setSystemPrompt('');
    setMaxSteps('50');
    setDefaultWorkspacePath(undefined);
    setPreviewDataUrl(undefined);
    setPendingAvatarFile(null);
    setVoiceId('');
    setVoiceLanguage('default');
    setCompressionThreshold('50');
    setDreamIntervalMinutes('120');
    setPoseImages([]);
    setPendingBgFile(null);
    setBgPreviewUrl(undefined);
    setBgDeleted(false);
  };

  /** 切换 Provider 时同步更新 modelId 为该 Provider 的第一个可用模型 */
  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const providerInfo = providers.find((p) => p.id === newProvider);
    if (providerInfo && providerInfo.models.length > 0) {
      setModelId(providerInfo.models[0]);
    }
  };

  /** 暂存头像上传的 base64 预览与原始文件，保存时统一提交 */
  const handleAvatarUpload = (file: File, dataUrl: string) => {
    setPreviewDataUrl(dataUrl);
    setPendingAvatarFile(file);
  };

  /**
   * 处理立绘上传，加入待保存列表。
   * 若当前尚无名为 default 的立绘，自动将本次上传命名为 default，
   * 保证陪伴面板始终有默认立绘可显示；否则沿用文件名并去重。
   */
  const handlePoseAdd = (file: File, dataUrl: string, name: string) => {
    const hasDefault = poseImages.some(
      (p) => p.status !== 'deleted' && p.name === 'default'
    );
    const finalName = hasDefault ? generatePoseName(name) : 'default';
    if (!hasDefault) {
      logger.info(`Auto-named new pose to default (original: ${name})`);
    }
    setPoseImages((prev) => [
      ...prev,
      { name: finalName, file, previewUrl: dataUrl, status: 'added' },
    ]);
  };

  const handlePoseRemove = (index: number) => {
    setPoseImages((prev) => {
      const item = prev[index];
      if (item.status === 'added') {
        return prev.filter((_, i) => i !== index);
      }
      return prev.map((p, i) =>
        i === index ? { ...p, status: 'deleted' as const } : p
      );
    });
  };

  const handlePoseRename = (index: number, newName: string) => {
    setPoseImages((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        return {
          ...p,
          name: newName,
          originalName:
            p.originalName ||
            (p.status === 'existing' ? p.name : p.originalName),
        };
      })
    );
  };

  /** 自动生成不重复的立绘名称 */
  const generatePoseName = (baseName: string): string => {
    const existing = new Set(
      poseImages.filter((p) => p.status !== 'deleted').map((p) => p.name)
    );
    if (!existing.has(baseName)) return baseName;
    let i = 1;
    while (existing.has(`${baseName}_${i}`)) i++;
    return `${baseName}_${i}`;
  };

  /** 暂存背景图上传的 base64 预览与原始文件，保存时统一提交 */
  const handleBgUpload = (file: File, dataUrl: string) => {
    setBgPreviewUrl(dataUrl);
    setPendingBgFile(file);
    setBgDeleted(false);
  };

  /** 移除背景图预览与暂存文件，编辑已有 Agent 时标记待删除 */
  const handleBgRemove = () => {
    setBgPreviewUrl(undefined);
    setPendingBgFile(null);
    if (editingAgentId) {
      setBgDeleted(true);
    }
  };

  /** 切换音色，清空音色时同步重置语音语言 */
  const handleVoiceChange = (v: string) => {
    if (v === '__none__') {
      setVoiceId('');
      setVoiceLanguage('default');
    } else {
      setVoiceId(v);
    }
  };

  /** 保存 Agent 配置及形象资源：先保存基本信息，再并行上传/删除/重命名立绘和背景图 */
  const handleSave = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      let savedId = editingAgentId;

      if (editingAgentId) {
        if (pendingAvatarFile) {
          await uploadAvatar(editingAgentId, pendingAvatarFile);
        }

        const input: AgentConfigUpdate = {
          name: name.trim(),
          description: description.trim() || undefined,
          defaultModel: { provider, model: modelId },
          systemPrompt,
          maxSteps: parseInt(maxSteps) || 50,
          compressionThreshold: parseInt(compressionThreshold) || 50,
          dreamIntervalMinutes: parseInt(dreamIntervalMinutes) || 120,
          defaultWorkspacePath: defaultWorkspacePath || '',
          voiceId: voiceId || undefined,
          voiceLanguage: voiceId ? voiceLanguage : undefined,
        };
        await updateAgentById(editingAgentId, input);
      } else {
        const input: AgentConfigInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          defaultModel: { provider, model: modelId },
          systemPrompt,
          mcpNames: [],
          skillNames: [],
          maxSteps: parseInt(maxSteps) || 50,
          compressionThreshold: parseInt(compressionThreshold) || 50,
          dreamIntervalMinutes: parseInt(dreamIntervalMinutes) || 120,
          defaultWorkspacePath: defaultWorkspacePath || '',
          voiceId: voiceId || undefined,
          voiceLanguage: voiceId ? voiceLanguage : undefined,
        };
        const newAgent = await createNewAgent(input);
        savedId = newAgent?.id || null;

        if (newAgent && pendingAvatarFile && previewDataUrl) {
          setAvatarPreview(newAgent.id, previewDataUrl);
          await uploadAvatar(newAgent.id, pendingAvatarFile);
          removeAvatarPreview(newAgent.id);
        }
      }

      /**
       * 并行执行所有待处理的形象资源操作。
       * 各操作独立互不依赖，用 Promise.all 并行发出以提高保存速度。
       */
      if (savedId) {
        const assetOps: Promise<unknown>[] = [];

        if (pendingBgFile) {
          assetOps.push(uploadBackgroundImage(savedId, pendingBgFile));
        }
        if (bgDeleted) {
          assetOps.push(deleteBackgroundImage(savedId));
        }

        for (const pose of poseImages) {
          if (pose.status === 'added' && pose.file) {
            assetOps.push(uploadPoseImage(savedId, pose.name, pose.file));
          }
          if (pose.status === 'deleted') {
            assetOps.push(
              deletePoseImage(savedId, pose.originalName || pose.name)
            );
          }
          if (
            pose.status === 'existing' &&
            pose.originalName &&
            pose.originalName !== pose.name
          ) {
            assetOps.push(
              renamePoseImage(savedId, pose.originalName, pose.name)
            );
          }
        }

        if (assetOps.length > 0) {
          await Promise.all(assetOps);
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
      if (!confirm(t('agentEditor.confirmDelete'))) return;
      onDelete(editingAgentId);
      closeAgentEditor();
    }
  };

  const previewAgent: AgentConfig = {
    id: editingAgentId || 'preview',
    name: name || 'A',
    description,
    systemPrompt,
    defaultModel: { provider, model: modelId },
    maxSteps: parseInt(maxSteps) || 50,
    mcpNames: [],
    skillNames: [],
    defaultWorkspacePath,
    compressionThreshold: parseInt(compressionThreshold) || 50,
    dreamIntervalMinutes: parseInt(dreamIntervalMinutes) || 120,
    voiceId: voiceId || undefined,
    voiceLanguage: voiceId ? voiceLanguage : undefined,
    createdAt: 0,
    updatedAt: 0,
  };

  // 立绘展示列表：隐藏已删除项，default 立绘固定排在最前
  const visiblePoseImages = (() => {
    const visible = poseImages.filter((p) => p.status !== 'deleted');
    const def = visible.find((p) => p.name === 'default');
    const rest = visible.filter((p) => p.name !== 'default');
    return def ? [def, ...rest] : rest;
  })();

  /** 将展示列表索引映射回完整 poseImages 数组的原始索引 */
  const poseActualIndex = (index: number) =>
    poseImages.indexOf(visiblePoseImages[index]);

  return (
    <div className="h-full w-full flex flex-col bg-muted">
      <div className="shrink-0 flex items-center gap-2 px-5 h-14 border-b border-border bg-muted">
        <BackButton onClick={closeAgentEditor} />
        <h1 className="text-[16px] font-bold text-foreground">
          {editingAgentId
            ? t('agentEditor.editAgent')
            : t('agentEditor.addAgent')}
        </h1>
        <div className="flex-1" />
        <div className="flex gap-2">
          <button
            onClick={closeAgentEditor}
            className="rounded-lg border border-border h-8 px-5 text-[13px] hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isLoading}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-lg h-8 px-5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? t('common.saving')
              : editingAgentId
                ? t('agentEditor.save')
                : t('agentEditor.add')}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-5 py-5">
            <div className="flex flex-col gap-4">
              <BasicInfoCard
                previewAgent={previewAgent}
                avatarPreviewUrl={previewDataUrl}
                name={name}
                onNameChange={setName}
                description={description}
                onDescriptionChange={setDescription}
                onAvatarUpload={handleAvatarUpload}
              />
              <AppearanceCard
                agentId={editingAgentId}
                poseImages={visiblePoseImages}
                onPoseAdd={handlePoseAdd}
                onPoseRemove={(idx) => handlePoseRemove(poseActualIndex(idx))}
                onPoseRename={(idx, newName) =>
                  handlePoseRename(poseActualIndex(idx), newName)
                }
                bgPreviewUrl={bgPreviewUrl}
                onBgUpload={handleBgUpload}
                onBgRemove={handleBgRemove}
                onBgPreviewError={() => setBgPreviewUrl(undefined)}
              />
              <ModelConfigCard
                providers={providers}
                provider={provider}
                onProviderChange={handleProviderChange}
                modelId={modelId}
                onModelChange={setModelId}
                maxSteps={maxSteps}
                onMaxStepsChange={setMaxSteps}
                systemPrompt={systemPrompt}
                onSystemPromptChange={setSystemPrompt}
              />
              <ChatConfigCard
                compressionThreshold={compressionThreshold}
                onCompressionThresholdChange={setCompressionThreshold}
                dreamIntervalMinutes={dreamIntervalMinutes}
                onDreamIntervalChange={setDreamIntervalMinutes}
              />
              <VoiceCard
                voices={voices}
                voiceId={voiceId}
                onVoiceChange={handleVoiceChange}
                voiceLanguage={voiceLanguage}
                onVoiceLanguageChange={setVoiceLanguage}
              />
              <WorkspaceCard
                value={defaultWorkspacePath}
                onChange={setDefaultWorkspacePath}
              />
              {editingAgentId && (
                <div className="flex justify-center pb-6">
                  <button
                    onClick={handleDelete}
                    className="text-[13px] text-red-400 hover:text-red-500 transition-colors"
                  >
                    {t('agentEditor.deleteAgent')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
