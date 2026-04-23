# AnimateClaw

AnimateClaw 是一个 AI Agent 桌面应用。用户可以在本地创建和管理多个 AI Agent，通过聊天界面与 Agent 交互，Agent 能够调用工具（执行命令、读写文件）来完成任务。应用内置 Cloudflare Tunnel 支持，可以将本地 Agent 暴露到公网，方便从手机或其他设备远程访问。

项目由两个核心部分组成：server 负责对话管理、工具执行、MCP 连接等后端逻辑；desktop 是 Electron 桌面客户端，提供图形界面。

## 技术栈

**Server**（`packages/server`）：TypeScript + Bun 运行时，使用 Express 提供 HTTP/WebSocket API，支持 OpenAI 和 Anthropic 等多个 LLM 供应商。Bun 的 `--compile` 将整个 server 打包成单个二进制文件，不需要用户安装任何运行时。

**Desktop**（`packages/desktop`）：Electron + React 18 + TypeScript，使用 electron-vite 构建，Tailwind CSS 做样式，Zustand 管理状态。应用启动时从 App Bundle 内直接运行 server 二进制，以子进程方式管理其生命周期。

## 开发环境准备

需要安装 [Bun](https://bun.sh/) 和 Node.js（18+）。

```bash
# 安装依赖
cd packages/server && bun install
cd packages/desktop && npm install
```

## 日常开发

在项目根目录运行一条命令即可启动开发环境：

```bash
npm run dev
```

这个命令会先编译 server 的二进制文件，然后启动 Electron 开发服务器。前端代码修改会通过热更新即时生效。如果修改了 server 的代码，需要退出后重新运行 `npm run dev`，因为 server 需要重新编译。

也可以单独操作某个包：

```bash
npm run build:server    # 只编译 server 二进制
npm run build:desktop   # 只编译前端（不启动 Electron）
```

## 构建安装包

```bash
npm run dist
```

这会先编译 server 和 desktop，然后用 electron-builder 打包成 .dmg（macOS）。打包后的安装包在 `packages/desktop/dist/` 目录下。安装后的应用是一个独立可执行文件，不需要用户安装 Bun 或 Node.js。

## 其他命令

```bash
npm run typecheck       # 对两个包一起做类型检查
```

Server 包还支持 lint 和格式化（需要在 `packages/server` 目录下运行）：

```bash
bun run lint            # oxlint 检查
bun run format          # Prettier 格式化
bun run test            # 运行测试
```

### 集成测试配置

`packages/server/tests/chat.test.ts` 是端到端集成测试，会调用真实的 LLM API，需要配置环境变量：

```bash
cd packages/server
cp .env.test.example .env.test.local
# 编辑 .env.test.local，填入你的 API Key
```

必填 `TEST_LLM_API_KEY`，可选 `TEST_LLM_PROVIDER`（默认 `minimax-cn`）和 `TEST_LLM_MODEL`（默认 `MiniMax-M2.7`）。`.env.test.local` 不会被提交到版本控制。如果不配置，chat 集成测试会被自动跳过，其他测试不受影响。可用的 Provider 列表见 `.env.test.example`。

Desktop 包的测试：

```bash
cd packages/desktop && npm run test
```

## 项目结构

```
AnimateClaw/
├── package.json              # 根编排脚本
├── packages/
│   ├── server/               # 后端服务（Bun 项目）
│   │   ├── src/
│   │   │   ├── agent/        # Agent 定义、配置存储、运行逻辑
│   │   │   ├── session/      # 会话管理、消息持久化
│   │   │   ├── server/       # HTTP/WebSocket 服务、路由、隧道
│   │   │   ├── tools/        # 工具实现（bash、文件读写、pose）
│   │   │   ├── mcp/          # MCP 协议连接管理
│   │   │   ├── skill/        # Skill 加载与管理
│   │   │   ├── auth/         # 认证
│   │   │   ├── config/       # 配置加载
│   │   │   ├── schema/       # 事件与数据 schema
│   │   │   ├── converters/   # LLM 响应格式转换
│   │   │   └── util/         # 工具函数、日志、路径
│   │   ├── bin/              # 预置的 cloudflared 二进制
│   │   └── dist/             # 编译输出的 server 二进制
│   └── desktop/              # 桌面客户端（Electron + npm 项目）
│       ├── src/
│       │   ├── main/         # Electron 主进程（生命周期、窗口、IPC）
│       │   ├── preload/      # 预加载脚本
│       │   └── renderer/     # React 前端（组件、Store、样式）
│       ├── electron-builder.yml
│       └── electron.vite.config.ts
```

## 用户数据目录

应用运行时会在系统标准数据目录下创建 `animateclaw/`，存放配置、Agent、会话和日志等数据。

| 平台 | 路径 |
|------|------|
| macOS | `~/.local/share/animateclaw/` |
| Windows | `%APPDATA%/animateclaw/` |
| Linux | `~/.local/share/animateclaw/` |

```
animateclaw/
├── config/
│   ├── config.yaml          # 全局配置
│   └── auth.json            # LLM 供应商 API Key
├── agents/
│   └── {agentId}/
│       ├── config.json      # Agent 配置
│       ├── assets/          # Agent 资源（头像、语音、姿态、背景）
│       ├── sessions/        # 会话历史
│       └── memory/          # Agent 记忆
├── skills/                  # 用户自定义 Skill
├── mcp/
│   ├── mcp.json             # MCP 服务器配置
│   └── servers/             # MCP 服务器运行时数据
├── workspace/               # 默认工作目录
└── logs/                    # 运行日志
```

如果从旧版本升级，首次启动时会自动将 `~/.nano-agent/` 的数据迁移到新路径，旧目录不会被删除。
