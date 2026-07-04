<p align="right">
简体中文 | <a href="README.en.md">English</a>
</p>

<div align="center">

<img src="assets/logo-rounded.png" width="150" height="150" alt="Persona Agent" />

# Persona Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-informational)
[![Release](https://img.shields.io/github/v/release/Code-MonkeyZhang/persona-agent?include_prereleases)](https://github.com/Code-MonkeyZhang/persona-agent/releases)

</div>

Persona 是一个开源的个人 AI Agent 聊天平台，让你能够为 AI Agent 设定性格、声音和形象。

你可以从 Agent 商城一键安装 Agent、MCP 工具和 Skill。

## 📷 预览

<table>
  <tr>
    <td><img src="assets/screenshot-main.jpg" width="400" /></td>
    <td><img src="assets/screenshot-companion.jpg" width="400" /></td>
  </tr>
</table>

## ✨ 核心功能
- **多 Agent 管理** — 创建多个独立 Agent, 角色设定、模型配置MCP、Agent Skill以及会话历史
- **支持 20+ LLM供应商** — DeepSeek、MiniMax、智谱、Kimi、OpenAI、Anthropic、Google、OpenRouter等多供应商支持
- **自定义 Agent 形象界面** — 支持自定义Agent的角色立绘和背景，Agent 会根据对话自动切换表情
- **自定义 Agent 语音朗读** - 支持Minimax TTS API的语音合成回复
- **支持 MCP 与 Agent Skill** — 支持自定义给每个Agent自定义MCP工具和Agent Skill，同时支持需要OAuth的MCP服务 （Notion， Github）
- **远程访问** — 内置 Cloudflare Tunnel，可以通过移动端App远程连接Agent

## 📢 News
- 2026-07-04 — **v1.6.0**：思考过程合并展示、API 错误提示随会话持久化、Windows 端改用 Git Bash、uv 运行时一键下载、聊天乐观加载。
- 2026-06-28 — **v1.5.0**：新增 Agent 市场，应用内集中浏览和安装技能与 MCP 工具；统一 HTTP 错误处理；设计系统落地。
- 2026-06-23 — **v1.4.0**：全新桌面端 UI（TitleBar + 双侧边栏）、Agent 聊天与多会话管理、技能/工具独立分配视图。
- 2026-06-04 — **v1.2.3**：修复会话切换时消息泄漏与跨会话语音播放，改进 Skill 路径解析与系统提示词编辑体验。

<details>
<summary>Earlier news</summary>

- 2026-05-24 — **v1.2.1**：Windows 平台支持、中英文双语界面。
- 2026-05-20 — **v1.2.0**：Agent 立绘与背景图管理、陪伴面板动画与窗口拖拽区域全面修复。
- 2026-05-18 — **v1.1.9**：Agent 编辑器形象（pose）管理、窗口拖拽支持。
- 2026-05-17 — **v1.1.8**：语音克隆、Web Fetch 工具、TTS 多语言翻译。
- 2026-05-12 — **v1.1.5**：Web Fetch 工具、MCP 入口与全局图标更新。
- 2026-05-03 — **v1.1.0**：首个迭代版本，搭建基础 Agent 架构与 CI/CD。
- 2026-04-27 — **v1.0.x**：Persona Agent 首个公开发布版本（MVP）。

</details>

→ [查看完整发版历史](https://github.com/Code-MonkeyZhang/persona-agent/releases)

## 🚀 快速开始

本项目支持 macOS 和 Windows 平台. 前往 [GitHub Releases](https://github.com/Code-MonkeyZhang/persona-agent/releases) 下载对应平台的安装包：

| 平台                | 文件                              |
| ------------------- | --------------------------------- |
| macOS Apple Silicon | `Persona-mac-arm64-{version}.dmg` |
| macOS Intel         | `Persona-mac-x64-{version}.dmg`   |
| Windows x64         | `Persona-win-x64-{version}.exe`   |

macOS 打开 DMG 拖入 Applications 即可；Windows 运行 exe 安装程序按提示完成安装。

> [!NOTE]
> macOS 首次打开若弹出「"Persona.app"已损坏，无法打开」，请在终端执行以下命令即可解除限制：
>
> ```bash
> xattr -cr /Applications/Persona.app
> ```
> 执行后即可正常打开。
>
> Windows 安装包未签名，首次运行可能被 SmartScreen 拦截，提示「已保护你的电脑」。点击「更多信息」→「仍要运行」即可继续安装。

## 🎨 Agent 自定义

Persona 让每个 Agent 都独一无二：立绘、背景、声音，全部由你定义。

### 形象自定义

为 Agent 自定义角色立绘和对话背景，Agent 会根据对话情绪自动切换表情。

<table>
  <tr>
    <td align="center"><b>默认</b></td>
    <td align="center"><b>非常喜欢</b></td>
    <td align="center"><b>病娇</b></td>
    <td align="center"><b>背景</b></td>
  </tr>
  <tr>
    <td><img src="assets/default.png" width="200" /></td>
    <td><img src="assets/非常喜欢.png" width="200" /></td>
    <td><img src="assets/病娇.png" width="200" /></td>
    <td><img src="assets/background.png" width="200" /></td>
  </tr>
</table>

### 语音自定义

为 Agent 配备专属语音。语音合成由 MiniMax TTS 驱动，提供多种预设音色，也支持录制音频克隆自定义语音。

> 💡 想要更多 Agent 模板、技能和工具？前往下方的 **Agent 商城**。

## 🛒 Agent 商城

Persona 内置商城，一站式浏览、安装和管理 Agent 模板、技能（Skill）与 MCP 工具。商城目录由开源仓库 [persona-agent-marketplace](https://github.com/Code-MonkeyZhang/persona-agent-marketplace) 驱动，支持一键安装并分配 MCP 和 Skill 给指定的 Agent。

- **Agent**：精选角色模板，安装即用
- **技能（Skill）**：为 Agent 注入专业知识与能力
- **工具（MCP）**：连接 Notion、GitHub 等外部服务，支持 OAuth 授权

## 📱 移动端

Persona 还提供 iOS 和 Android 的移动端 app，通过 Cloudflare Tunnel 连接你的智能体，随时随地与 Agent 对话。

<table>
  <tr>
    <td align="center"><b>移动端演示</b></td>
    <td align="center"><b>普通对话</b></td>
    <td align="center"><b>Agent 详情</b></td>
  </tr>
  <tr>
    <td><img src="assets/mobile-agent.gif" width="250" /></td>
    <td><img src="assets/normal-conversation.gif" width="250" /></td>
    <td><img src="assets/agent-detail.gif" width="250" /></td>
  </tr>
</table>

→ [查看移动端项目](https://github.com/Code-MonkeyZhang/persona-agent-mobile)

## 💜 致谢

### 参考项目

- [Chatbox](https://github.com/chatboxai/chatbox) — 跨平台 AI 桌面客户端
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — 全功能 AI 助手，多供应商 LLM 支持
- [Halo](https://github.com/openkursar/hello-halo) — 24/7 自主桌面 AI Agent，数字人形象系统
- [OpenCode](https://github.com/anomalyco/opencode) — AI 编程工具，本项目架构与构建体系的重要参考
- [ZcChat](https://github.com/Zao-chen/ZcChat) — 桌面 AI 伴侣，Galgame 风格角色立绘与语音交互

### 技术依赖

- [pi-ai](https://github.com/mariozechner/pi-ai) — 统一多供应商 LLM 调用接口
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP工具扩展协议
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — 提供内网穿透能力
- [MiniMax](https://www.minimaxi.com/) — TTS 语音合成
