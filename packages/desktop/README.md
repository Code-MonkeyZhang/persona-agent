# Persona Desktop

Persona Agent 的跨平台桌面客户端。内嵌后端二进制，下载安装包后无需任何配置即可使用。

## 技术栈

- **框架**: Electron 28 + React 18 + TypeScript 5.3
- **构建工具**: electron-vite 2.0
- **UI**: Tailwind CSS 3.4 + Radix UI
- **状态管理**: Zustand 4.5
- **Markdown**: react-markdown 10 + remark-gfm + rehype-highlight
- **虚拟列表**: react-virtuoso

## 核心功能

### Agent 管理

- 创建、编辑、删除多个 Agent，每个有独立的角色设定和模型配置
- Agent 头像自定义，支持上传 pose 表情和背景图
- 左侧 Agent 列表一键切换

### 流式对话

- SSE 流式输出，实时渲染 Markdown（表格、代码块高亮、LaTeX）
- 代码块一键复制，Agent 推理过程和工具调用可折叠查看
- 会话历史管理，支持创建、重命名、删除会话

### 伴侣模式

- 全屏展示角色立绘，背景图随 Agent 配置切换
- Agent 根据对话自动切换表情（pose）
- 语音合成朗读回复（MiniMax TTS）

### MCP & Skills

- 通过 MCP 协议连接外部工具服务器扩展 Agent 能力
- 加载 Skill 赋予 Agent 专业知识
- 设置中心统一管理 MCP 服务和 Skills

### 模型供应商

支持 OpenAI、Anthropic、Google、DeepSeek、MiniMax、xAI、Groq、Mistral、OpenRouter、Cerebras、Fireworks 等 17+ 家供应商。每个 Agent 独立配置默认模型，每个会话可以临时切换。

### 其他

- Cloudflare Tunnel 一键内网穿透，远程访问 Agent
- 自动启动内嵌的后端二进制，用户无需手动管理进程
- 支持 macOS（Apple Silicon / Intel）和 Windows x64

## 开发

```bash
# 安装依赖
cd packages/server && bun install
cd packages/desktop && npm install

# 开发模式（自动编译 server + 启动 Electron）
npm run dev

# 仅构建前端
npm run build

# 构建安装包
npm run dist           # 当前平台
npm run dist:mac       # macOS (dmg)
npm run dist:win       # Windows (nsis)
```

其他命令：

```bash
npm run typecheck      # 类型检查
npm run test           # 单元测试 (Vitest)
```

## 项目结构

```
desktop/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 应用入口，窗口创建、进程管理
│   │   ├── server-manager.ts  # 后端进程生命周期管理
│   │   └── store/         # electron-store 持久化配置
│   ├── preload/           # 预加载脚本
│   └── renderer/          # React 前端
│       ├── components/    # UI 组件
│       │   ├── AgentSidebar.tsx      # Agent 列表侧边栏
│       │   ├── AgentEditor.tsx       # Agent 编辑器
│       │   ├── MessageList.tsx       # 消息列表（虚拟滚动）
│       │   ├── CompanionPanel.tsx    # 伴侣模式全屏面板
│       │   ├── SettingsPage.tsx      # 设置中心（5 个 Tab）
│       │   ├── ModelSelector.tsx     # 模型选择器
│       │   └── ...
│       ├── stores/        # Zustand 状态管理
│       ├── lib/           # API 请求、工具函数
│       └── types/         # TypeScript 类型定义
├── build/                 # 图标等构建资源
├── resources/             # 种子数据（默认 Agent）
├── electron.vite.config.ts
└── electron-builder.yml
```

## 与 Server 的关系

Desktop 的安装包内嵌了编译好的 Persona Agent Server 二进制。启动时主进程自动在后台拉起 Server，无需用户手动操作。开发模式下从项目构建产物加载 Server。

## License

[MIT](../../LICENSE)
