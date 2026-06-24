/**
 * @file App.tsx
 * @description Electron前端渲染进程根组件
 *
 * 布局自上而下：TitleBar + 下方横向布局。
 * currentView 决定顶层视图。
 * 主布局内部由 viewStore.activeNav 驱动 MainContent 区域切换：
 * - 'chat'           → 对话区
 * - 'agent-settings' → Agent 编辑页面
 * - 'tools'          → MCP 工具分配视图
 * - 'skills'         → Skill 分配视图
 *
 * Session 栏折叠状态由 viewStore.sessionSidebarCollapsed 管理，
 * 折叠开关位于 TitleBar，不再需要独立的悬浮按钮。
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { TitleBar } from './components/TitleBar';
import { Header } from './components/Header';
import { MessageList, type MessageListRef } from './components/MessageList';
import { InputBox } from './components/InputBox';
import { AgentSidebar } from './components/AgentSidebar';
import { SessionSidebar } from './components/SessionSidebar';
import { SettingsPage } from './components/SettingsPage';
import { AgentEditor } from './components/AgentEditor';
import { AgentToolsView } from './components/AgentToolsView';
import { SkillsView } from './components/SkillsView';
import { MarketplaceView } from './components/MarketplaceView';
import { CompanionPanel } from './components/CompanionPanel';
import { ToastContainer } from './components/Toast';
import { WebSocketProvider } from './components/WebSocketProvider';
import { useChatStore } from './stores/chatStore';
import { useSessionStore } from './stores/sessionStore';
import { useAgentStore } from './stores/agentStore';
import { useProviderStore } from './stores/providerStore';
import { useCompanionStore } from './stores/companionStore';
import { useViewStore } from './stores/viewStore';
import { logger } from './lib/logger';

/**
 * 主聊天界面组件，整合所有子组件并管理核心交互逻辑
 */
function AppContent() {
  /* 状态定义 */

  const companionVisible = useCompanionStore((s) => s.visible);
  const currentView = useViewStore((s) => s.currentView);
  const editingAgentId = useViewStore((s) => s.editingAgentId);
  const activeNav = useViewStore((s) => s.activeNav);

  const pendingProviderRef = useRef<string | undefined>();
  const messageListRef = useRef<MessageListRef>(null);

  /* 从Store中获取数据 */
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const currentSessionState = useChatStore((s) =>
    currentSessionId ? s.sessionStates.get(currentSessionId) : undefined
  );
  const messages = currentSessionState?.messages ?? [];
  const isLoading = currentSessionState?.isLoading ?? false;

  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setAgentId = useChatStore((s) => s.setAgentId);

  const {
    currentSession,
    createNewSession,
    convertSessionMessages,
    loadSessions,
  } = useSessionStore();

  const { loadAgents, currentAgent, deleteAgentById } = useAgentStore();
  const { providers, loadProviders } = useProviderStore();

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
    if (connectionStatus === 'connected' && currentAgent) {
      loadSessions(currentAgent.id);
    }
  }, [connectionStatus, currentAgent, loadSessions]);

  const activeSessionId = currentSession?.id ?? null;

  /**
   * session 切换时更新 currentSessionId 指针并按需加载历史消息。
   * 已在 sessionStates Map 中存在的 session 直接复用，无需重新加载。
   */
  useEffect(() => {
    const session = useSessionStore.getState().currentSession;
    const chatStore = useChatStore.getState();

    if (session) {
      chatStore.setCurrentSessionId(session.id);
      setAgentId(session.agentId);

      if (useSessionStore.getState().isNewlyCreated) {
        useSessionStore.setState({ isNewlyCreated: false });
        chatStore.initSessionState(session.id, []);
      } else if (!chatStore.sessionStates.has(session.id)) {
        const convertedMessages = convertSessionMessages(session.messages);
        chatStore.initSessionState(session.id, convertedMessages);
      }
    } else {
      chatStore.setCurrentSessionId(null);
      setAgentId(currentAgent?.id ?? null);
    }
  }, [activeSessionId, currentAgent, setAgentId, convertSessionMessages]);

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
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <AgentSidebar connectionStatus={connectionStatus} />
        <div className="flex-1 flex min-h-0 min-w-0">
          {currentView === 'settings' ? (
            <SettingsPage />
          ) : (
            <>
              <SessionSidebar />
              <div className="flex-1 overflow-hidden min-w-0">
                {activeNav === 'chat' && (
                  <div className="h-full flex flex-col">
                    <Header onNewChat={handleNewChat} />
                    <div className="flex-1 flex flex-col min-h-0 relative">
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
                        disabled={!currentAgent}
                        providers={providers}
                        currentModelId={currentModelId}
                        currentProviderId={currentProviderId}
                        onModelChange={handleModelChange}
                        onProviderChange={handleProviderChange}
                        workspacePath={currentWorkspacePath}
                        onWorkspaceChange={handleWorkspaceChange}
                      />
                      <AnimatePresence initial={false}>
                        {companionVisible && (
                          <CompanionPanel
                            agentId={currentAgent?.id ?? null}
                            onSend={handleSend}
                            isLoading={isLoading}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
                {activeNav === 'agent-settings' && (
                  <AgentEditor
                    editingAgentId={editingAgentId}
                    onDelete={handleDeleteAgent}
                  />
                )}
                {activeNav === 'tools' && <AgentToolsView />}
                {activeNav === 'skills' && <SkillsView />}
                {activeNav === 'marketplace' && <MarketplaceView />}
              </div>
            </>
          )}
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}

/**
 * 应用根组件，渲染主聊天界面
 */
function App() {
  return (
    <WebSocketProvider>
      <AppContent />
    </WebSocketProvider>
  );
}

export default App;
