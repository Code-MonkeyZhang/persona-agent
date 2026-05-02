<div align="center">

<img src="assets/logo-rounded.png" width="150" height="150" alt="Persona Agent" />

# Persona Agent

**你的本地 AI Agent 工作站**

创建和管理多个 AI Agent，赋予它们工具、技能和性格，让它们帮你完成任务。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-informational)
[![Release](https://img.shields.io/github/v/release/Code-MonkeyZhang/persona-agent?include_prereleases)](https://github.com/Code-MonkeyZhang/persona-agent/releases)

</div>

## 截图

![主界面](assets/screenshot-main.jpg)

![Agent 形象](assets/screenshot-companion.jpg)

<!-- ![Agent 设置](assets/screenshot-agent-settings.jpg) -->

<!-- ![模型配置](assets/screenshot-model-config.jpg) -->

## 核心功能

- **自定义自己的Agent 形象** — 支持自定义Agent的角色立绘和声音，Agent 会根据对话自动切换表情，配合语音合成回复, 让你的智能体栩栩如生!
- **多 Agent 管理** — 创建多个独立 Agent，每个有自己的角色设定、模型配置MCP、Agent Skill以及会话历史
- **17+ 模型供应商支持** — OpenAI、Anthropic、Google、DeepSeek、MiniMax、xAI、Groq、Mistral、OpenRouter、Cerebras、Fireworks 等，每个 Agent 独立配置默认模型，每个会话可以临时切换
- **MCP与Skill支持** — 支持自定义给每个Agent自定义MCP工具和Agent Skill
- **远程访问** — 内置 Cloudflare Tunnel，从通过手机App远程调用!
- **跨平台** — macOS（Apple Silicon / Intel）、Windows x64，下载即用，无需安装运行时

## 下载安装

前往 [GitHub Releases](https://github.com/Code-MonkeyZhang/persona-agent/releases) 下载对应平台的安装包：

| 平台                | 文件                              |
| ------------------- | --------------------------------- |
| macOS Apple Silicon | `Persona-mac-arm64-{version}.dmg` |
| macOS Intel         | `Persona-mac-x64-{version}.dmg`   |
| Windows x64         | `Persona-win-x64-{version}.exe`   |

macOS 打开 DMG 拖入 Applications，Windows 运行 exe 安装即可。

## 从源码构建

需要 [Bun](https://bun.sh/) 1.0+ 和 Node.js 18+。

```bash
# 安装依赖
cd packages/server && bun install
cd packages/desktop && npm install

# 开发模式（编译 server + 启动 Electron 开发服务器）
npm run dev

# 构建安装包
npm run dist          # 当前平台
npm run dist:mac      # macOS
npm run dist:win      # Windows
```

其他命令：

```bash
npm run typecheck     # 类型检查
npm run lint          # 代码检查
npm run format        # 格式化
npm run check         # 一键检查（lint + format + typecheck）
```

### 测试

```bash
cd packages/server && bun test
cd packages/desktop && npm run test
```

Server 的集成测试需要配置环境变量：

```bash
cd packages/server
cp .env.test.example .env.test.local
# 编辑 .env.test.local，填入 API Key
```

不配置时集成测试会自动跳过，其他测试不受影响。

## 用户数据目录

| 平台    | 路径                            |
| ------- | ------------------------------- |
| macOS   | `~/.local/share/persona-agent/` |
| Windows | `%APPDATA%/persona-agent/`      |

```
persona-agent/
├── config/              # 全局配置、API Key
├── agents/{id}/         # Agent 配置、资源、会话
├── skills/              # 自定义 Skill
├── mcp/                 # MCP 服务器配置和运行时数据
└── logs/                # 运行日志
```

## 致谢

### 参考项目

- [Chatbox](https://github.com/chatboxai/chatbox) — 跨平台 AI 桌面客户端
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — 全功能 AI 助手，多供应商 LLM 支持
- [Halo](https://github.com/openkursar/hello-halo) — 24/7 自主桌面 AI Agent，数字人形象系统
- [OpenCode](https://github.com/anomalyco/opencode) — AI 编程工具，本项目架构与构建体系的重要参考
- [ZcChat](https://github.com/Zao-chen/ZcChat) — 桌面 AI 伴侣，Galgame 风格角色立绘与语音交互

### 技术依赖

- [Bun](https://bun.sh/) — Server 运行时，单文件编译分发
- [Electron](https://www.electronjs.org/) — 跨平台桌面应用框架
- [React](https://react.dev/) — UI 框架
- [pi-ai](https://github.com/mariozechner/pi-ai) — 统一多供应商 LLM 调用接口
- [Model Context Protocol](https://modelcontextprotocol.io/) — 工具扩展协议
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — 内网穿透
- [MiniMax](https://www.minimaxi.com/) — TTS 语音合成
