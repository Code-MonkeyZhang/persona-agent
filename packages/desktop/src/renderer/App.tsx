/**
 * @file App.tsx
 * @description Electron前端渲染进程根组件
 *
 * 布局自上而下：TitleBar + 下方横向布局。
 * currentView 决定顶层视图。
 * 主布局内部由 viewStore.activeNav 驱动 MainContent 区域切换：
 * - 'chat'             → 对话区
 * - 'agent-settings'   → Agent 编辑页面
 * - 'tools'            → MCP 工具分配视图
 * - 'skills'           → Skill 分配视图
 *
 * currentView 还可切换到全屏视图（替换 SessionSidebar + 内容区）：
 * - 'settings'    → 设置页
 * - 'marketplace' → 商城浏览页（罗盘进入，唯一安装入口）
 *
 * Session 栏折叠状态由 viewStore.sessionSidebarCollapsed 管理，
 * 折叠开关位于 TitleBar，不再需要独立的悬浮按钮。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
import { CompanionContent } from './components/CompanionContent';
import { CompanionReplyBubble } from './components/CompanionReplyBubble';
import { AppIconBar } from './components/AppIconBar';
import { AppWebViewPanel } from './components/AppWebViewPanel';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { ToastContainer } from './components/Toast';
import { WebSocketProvider } from './components/WebSocketProvider';
import { useChatStore } from './stores/chatStore';
import { useSessionStore } from './stores/sessionStore';
import { useAgentStore } from './stores/agentStore';
import { useProviderStore } from './stores/providerStore';
import { useCompanionStore } from './stores/companionStore';
import { useViewStore } from './stores/viewStore';
import { useTunnelStore } from './stores/tunnelStore';
import { useAppPanelStore } from './stores/appPanelStore';
import { logger } from './lib/logger';

/**
 * 主聊天界面组件，整合所有子组件并管理核心交互逻辑
 */
function AppContent() {
  const companionVisible = useCompanionStore((s) => s.visible);
  const currentView = useViewStore((s) => s.currentView);
  const editingAgentId = useViewStore((s) => s.editingAgentId);
  const activeNav = useViewStore((s) => s.activeNav);
  const panelCollapsed = useAppPanelStore((s) => s.panelCollapsed);
  const selectedApp = useAppPanelStore((s) => s.selectedApp);

  const pendingProviderRef = useRef<string | undefined>();
  const messageListRef = useRef<MessageListRef>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const [floatingHeight, setFloatingHeight] = useState(0);

  /**
   * 测量浮层 InputBox 区域的实际高度，同步给 MessageList 作为 bottomPadding，
   * 避免消息列表底部被常驻浮层永久遮挡。
   * 通过 ResizeObserver 监听 textarea 撑高与回复气泡挂载/卸载带来的高度变化。
   */
  useLayoutEffect(() => {
    const el = floatingRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      if (h > 0 && h !== floatingHeight) {
        setFloatingHeight(h);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [floatingHeight]);

  /** 陪伴开关切换日志，便于排查 pane 滑动与浮层联动问题 */
  useEffect(() => {
    logger.info(
      `[App] companion view: ${companionVisible ? 'open' : 'closed'}`
    );
  }, [companionVisible]);

  /* 从Store中获取数据 */
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const currentSessionState = useChatStore((s) =>
    currentSessionId ? s.sessionStates.get(currentSessionId) : undefined
  );
  const messages = currentSessionState?.messages ?? [];
  const isLoading = currentSessionState?.isLoading ?? false;
  const streamingMessageId = currentSessionState?.streamingMessageId ?? null;

  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortGeneration = useChatStore((s) => s.abortGeneration);
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
  - 同步隧道状态（可能从上次 session 遗留 running）
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

  useEffect(() => {
    if (connectionStatus === 'connected') {
      useTunnelStore.getState().refreshStatus();
    }
  }, [connectionStatus]);

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

      // 从 session 元数据恢复 pose
      const pose = session.currentPose ?? 'default';
      useCompanionStore.getState().setPose(pose);
      logger.info(`[App] session switch, restoring pose: ${pose}`);

      if (useSessionStore.getState().isNewlyCreated) {
        useSessionStore.setState({ isNewlyCreated: false });
        chatStore.initSessionState(session.id, []);
      } else if (!chatStore.sessionStates.has(session.id)) {
        const convertedMessages = convertSessionMessages(session.messages);
        chatStore.initSessionState(session.id, convertedMessages);
      }
      // 进入 session 时订阅事件流，获取 isGenerating 状态并接收后续事件
      chatStore.subscribeSession(session.id);
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
          ) : currentView === 'marketplace' ? (
            <MarketplaceView />
          ) : (
            <>
              <SessionSidebar />
              <Group orientation="horizontal" className="flex-1 min-w-0">
                <Panel defaultSize="70" minSize="40">
                  <div className="h-full overflow-hidden">
                    {activeNav === 'chat' && (
                      <div className="h-full flex flex-col">
                        <Header onNewChat={handleNewChat} />
                        <div className="flex-1 min-h-0 relative">
                          {/* 双 pane 横向滑动容器，整屏滑动同一时间只看到一个 pane */}
                          <div className="absolute inset-0 overflow-hidden">
                            <motion.div
                              className="flex h-full w-[200%]"
                              initial={false}
                              animate={{ x: companionVisible ? '-50%' : '0%' }}
                              transition={{ duration: 0.3, ease: 'easeOut' }}
                            >
                              {/* Pane 1: 聊天列表 */}
                              <div className="w-1/2 h-full flex flex-col min-h-0">
                                <MessageList
                                  ref={messageListRef}
                                  key={currentSession?.id ?? 'no-session'}
                                  messages={messages}
                                  isLoading={isLoading}
                                  streamingMessageId={streamingMessageId}
                                  sessionId={currentSession?.id ?? null}
                                  hasAgent={!!currentAgent}
                                  agent={currentAgent}
                                  bottomPadding={floatingHeight}
                                />
                              </div>
                              {/* Pane 2: 陪伴展示 */}
                              <div className="w-1/2 h-full">
                                <CompanionContent
                                  agentId={currentAgent?.id ?? null}
                                />
                              </div>
                            </motion.div>
                          </div>

                          {/* 浮层：常驻底部，聊天态与陪伴态共用同一个 InputBox */}
                          <div className="absolute bottom-0 left-0 right-0 z-20">
                            {companionVisible && (
                              <CompanionReplyBubble
                                agentId={currentAgent?.id ?? null}
                              />
                            )}
                            <div
                              ref={floatingRef}
                              className={
                                companionVisible
                                  ? ''
                                  : 'bg-background/80 backdrop-blur-md'
                              }
                            >
                              <InputBox
                                onSend={handleSend}
                                onAbort={() => abortGeneration()}
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
                            </div>
                          </div>
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
                  </div>
                </Panel>
                {!panelCollapsed && selectedApp && (
                  <>
                    <Separator className="w-1 bg-border hover:bg-primary/20 transition-colors" />
                    <Panel defaultSize="30" minSize="20" maxSize="50">
                      <AppWebViewPanel />
                    </Panel>
                  </>
                )}
              </Group>
              <AppIconBar />
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
