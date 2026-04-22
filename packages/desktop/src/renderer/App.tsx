/**
 * @file App.tsx
 * @description Electron前端渲染进程根组件
 *
 * 根据 URL hash 决定渲染哪个窗口：
 * - #settings → 设置窗口（SettingsWindow）
 * - 其他     → 主界面（WebSocketProvider + AppContent）
 *
 * AppContent 是主界面的核心，包含：
 * - AgentSidebar：左侧 Agent 列表
 * - SessionSidebar：会话列表
 * - MessageList：消息展示
 * - InputBox：输入框
 * - AgentEditor：Agent 编辑弹窗
 */
import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { MessageList, type MessageListRef } from './components/MessageList';
import { InputBox } from './components/InputBox';
import { AgentSidebar } from './components/AgentSidebar';
import { SessionSidebar } from './components/SessionSidebar';
import { SessionSidebarToggle } from './components/SessionSidebarToggle';
import { SettingsWindow } from './components/SettingsWindow';
import { AgentEditor } from './components/AgentEditor';
import { CompanionPanel } from './components/CompanionPanel';
import { ToastContainer } from './components/Toast';
import { WebSocketProvider } from './components/WebSocketProvider';
import { useChatStore } from './stores/chatStore';
import { useSessionStore } from './stores/sessionStore';
import { useAgentStore } from './stores/agentStore';
import { useProviderStore } from './stores/providerStore';
import { useCompanionStore } from './stores/companionStore';
import { useVoiceStore } from './stores/voiceStore';
import { logger } from './lib/logger';

/**
 * 主聊天界面组件，整合所有子组件并管理核心交互逻辑
 */
function AppContent() {
  /* 状态定义 */

  const [agentEditorOpen, setAgentEditorOpen] = useState(false); // Agent编辑弹窗是否打开 TODO: 如果要修改Agent编辑页面, 这个地方要改
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pendingProviderRef = useRef<string | undefined>();
  const messageListRef = useRef<MessageListRef>(null);

  /* 从Store中获取数据 */
  const {
    messages,
    connectionStatus,
    isLoading,
    sendMessage,
    setMessages,
    clearMessages,
    setSessionId,
    setAgentId,
  } = useChatStore();

  const {
    currentSession,
    createNewSession,
    convertSessionMessages,
    loadSessions,
  } = useSessionStore();

  const { loadAgents, currentAgent, deleteAgentById } = useAgentStore();
  const { providers, loadProviders } = useProviderStore();
  const companionVisible = useCompanionStore((s) => s.visible);
  const loadVoiceApiKey = useVoiceStore((s) => s.loadVoiceApiKey); // 获取TTS API key

  /* 定义Agent弹窗的操作 */
  /**
   * 打开 Agent 编辑弹窗，传入 null 表示新建，传入 id 表示编辑已有 Agent
   * @param agentId - 要编辑的 Agent ID，null 时为新建模式
   */
  const handleOpenAgentEditor = (agentId: string | null) => {
    setEditingAgentId(agentId);
    setAgentEditorOpen(true);
  };

  /** 关闭 Agent 编辑弹窗并清空编辑状态 */
  const handleCloseAgentEditor = () => {
    setAgentEditorOpen(false);
    setEditingAgentId(null);
  };

  /**
   * 删除指定 Agent
   * @param id - 要删除的 Agent ID
   */
  const handleDeleteAgent = async (id: string) => {
    await deleteAgentById(id);
  };

  /*  定义连接成功后的useEffect操作
  - 加载Agent列表
  - 加载 Provider 列表
  - 连接成功且选中 Agent 后，加载该 Agent 的会话列表
  */
  useEffect(() => {
    if (connectionStatus === 'connected') {
      loadAgents();
    }
  }, [connectionStatus, loadAgents]);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      loadProviders();
    }
  }, [connectionStatus, loadProviders]);

  useEffect(() => {
    loadVoiceApiKey();
  }, [loadVoiceApiKey]);

  useEffect(() => {
    if (connectionStatus === 'connected' && currentAgent) {
      loadSessions(currentAgent.id);
    }
  }, [connectionStatus, currentAgent, loadSessions]);

  // 切换会话时，同步会话状态（id、agentId、消息）到 UI；无会话则重置
  useEffect(() => {
    if (currentSession) {
      setSessionId(currentSession.id);
      setAgentId(currentSession.agentId);
      const convertedMessages = convertSessionMessages(currentSession.messages);
      setMessages(convertedMessages);
    } else {
      setSessionId(null);
      setAgentId(currentAgent?.id ?? null);
      clearMessages();
    }
  }, [
    currentSession,
    currentAgent,
    setSessionId,
    setAgentId,
    setMessages,
    clearMessages,
    convertSessionMessages,
  ]);

  const currentModelId =
    currentSession?.model?.model || currentAgent?.defaultModel?.model || '';
  const currentProviderId =
    currentSession?.model?.provider || currentAgent?.defaultModel?.provider;
  const currentWorkspacePath =
    currentSession?.workspacePath || currentAgent?.defaultWorkspacePath;

  /**
   * 切换当前会话的模型，同时使用待定的供应商 ID 更新会话配置
   * @param modelId - 新模型的 ID
   * @returns Promise<void>
   */
  const handleModelChange = async (modelId: string) => {
    if (currentSession && currentAgent) {
      const providerId = pendingProviderRef.current || currentProviderId || '';
      pendingProviderRef.current = undefined;
      await useSessionStore
        .getState()
        .updateSessionModel(
          currentAgent.id,
          currentSession.id,
          providerId,
          modelId
        );
    }
  };

  /**
   * 记录待切换的供应商 ID，等待模型选择后一并提交
   * @param providerId - 新供应商的 ID
   */
  const handleProviderChange = (providerId: string) => {
    pendingProviderRef.current = providerId;
  };

  /**
   * 切换当前会话的工作目录
   * @param workspacePath - 新的工作目录路径，undefined 表示清除
   * @returns Promise<void>
   */
  const handleWorkspaceChange = async (workspacePath: string | undefined) => {
    if (currentSession && currentAgent) {
      await useSessionStore
        .getState()
        .updateSessionWorkspace(
          currentAgent.id,
          currentSession.id,
          workspacePath
        );
    }
  };

  /**
   * 清空当前会话，回到新建聊天状态
   * @returns void
   */
  const handleNewChat = () => {
    useSessionStore.setState({ currentSession: null });
  };

  /**
   * 发送消息：若无当前会话则先创建新会话，再发送内容
   * @param content - 用户输入的消息文本
   * @returns Promise<void>
   */
  const handleSend = async (content: string) => {
    if (!currentAgent) {
      logger.warn('No agent selected');
      return;
    }

    messageListRef.current?.scrollToBottom('instant');

    if (!currentSession) {
      const newSession = await createNewSession(currentAgent.id);
      if (newSession) {
        useSessionStore.getState().updateCurrentSession(newSession);
        sendMessage(content, newSession.id);
        return;
      }
    }
    sendMessage(content);
  };

  return (
    <div className="h-full flex bg-white">
      <AgentSidebar
        connectionStatus={connectionStatus}
        onOpenAgentEditor={handleOpenAgentEditor}
      />
      <SessionSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(true)}
      />
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        {sidebarCollapsed && (
          <SessionSidebarToggle
            isOpen={false}
            onToggle={() => setSidebarCollapsed(false)}
          />
        )}
        <Header onNewChat={handleNewChat} />
        <MessageList
          ref={messageListRef}
          key={currentSession?.id ?? 'no-session'}
          messages={messages}
          isLoading={isLoading}
          sessionId={currentSession?.id ?? null}
          hasAgent={!!currentAgent}
          agent={currentAgent}
        />
        <InputBox
          onSend={handleSend}
          isLoading={isLoading}
          disabled={!currentAgent} // 如果当前没有选中的Agent, 禁用输入框
          providers={providers}
          currentModelId={currentModelId}
          currentProviderId={currentProviderId}
          onModelChange={handleModelChange}
          onProviderChange={handleProviderChange}
          workspacePath={currentWorkspacePath}
          onWorkspaceChange={handleWorkspaceChange}
        />
        {companionVisible && (
          <CompanionPanel
            agentId={currentAgent?.id ?? null}
            onSend={handleSend}
            isLoading={isLoading}
          />
        )}
      </div>
      <AgentEditor
        isOpen={agentEditorOpen}
        editingAgentId={editingAgentId}
        onClose={handleCloseAgentEditor}
        onDelete={handleDeleteAgent}
      />
      <ToastContainer />
    </div>
  );
}

/**
 * 应用根组件，根据 URL hash 决定渲染设置窗口或主聊天界面
 */
function App() {
  // 读取当前窗口 URL 中 # 后面的内容，例如 "#settings"
  // 主进程创建设置窗口时会拼接 #settings，据此判断当前是否为设置窗口
  const hash = window.location.hash;
  const isSettingsWindow = hash === '#settings';

  // 设置窗口只渲染设置界面，不加载聊天相关的逻辑
  if (isSettingsWindow) {
    return <SettingsWindow />;
  }

  return (
    <WebSocketProvider>
      <AppContent />
    </WebSocketProvider>
  );
}

export default App;
