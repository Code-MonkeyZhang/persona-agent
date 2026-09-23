<p align="right">
<a href="README.md">简体中文</a> | English
</p>

<div align="center">

<img src="assets/logo-rounded.png" width="150" height="150" alt="Persona Agent" />

# Persona Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-informational)
[![Release](https://img.shields.io/github/v/release/Code-MonkeyZhang/persona-agent?include_prereleases)](https://github.com/Code-MonkeyZhang/persona-agent/releases)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**An open-source personal AI companion you can fully customize**

[📥 Download](https://github.com/Code-MonkeyZhang/persona-agent/releases) · [🐛 Report a Bug](https://github.com/Code-MonkeyZhang/persona-agent/issues) · [🛒 Agent Marketplace](https://github.com/Code-MonkeyZhang/persona-agent-marketplace)

</div>

---

Persona is an open-source personal AI Agent chat platform that lets you give your agents custom personality, voice, and portraits.

Install agents, MCP tools, and Skills from the Agent Marketplace in one click.

## 📷 Screenshots

<table>
  <tr>
    <td align="center"><b>💬 A clean chat interface with a familiar messaging-app feel</b></td>
    <td align="center"><b>🌸 Switch to the portrait view anytime, expressions follow the mood</b></td>
  </tr>
  <tr>
    <td><img src="assets/preview-chat.jpg" width="400" /></td>
    <td><img src="assets/preview-companion.jpg" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><b>🛒 One-click install of AI characters, skills, and tools from the built-in marketplace</b></td>
    <td align="center"><b>🎨 Open the Agent editor anytime to customize portraits, voice, and prompts</b></td>
  </tr>
  <tr>
    <td><img src="assets/preview-marketplace.jpg" width="400" /></td>
    <td><img src="assets/preview-agent-editor.jpg" width="400" /></td>
  </tr>
</table>

## ✨ Key Features

- **Long-Term Memory** — Conversations are summarized automatically and consolidated into long-term memory on a schedule, so agents remember you across sessions
- **Custom Character Portraits** — Assign character portraits and conversation backgrounds; agents switch expressions based on conversation mood
- **Custom Voice** — TTS replies powered by MiniMax, with preset voices and custom voice cloning from recordings
- **MCP & Agent Skills** — Assign MCP tools and Agent Skills to each agent individually, including OAuth-based MCP services (Notion, GitHub)
- **Agent Apps** — Install dedicated mini-apps for your Agent, interact via the app panel and receive app notifications
- **Mobile Remote Access** — Built-in Cloudflare Tunnel for connecting to your agent from the mobile app anytime

## 📢 Changelog

- 2026-09-23 — **v1.10.1**: app-wide visual refresh, collapsible session sidebar with animation and width memory, cloned voice renaming, permanently active input box.
- 2026-09-19 — **v1.10.0**: global Inter font and unified type scale, per-turn assistant message bubbles, redesigned provider config panel, edge-fade scroll indicators.
- 2026-09-09 — **v1.9.2**: desktop logs persisted to the user data directory for easier troubleshooting.

<details>
<summary>Earlier news</summary>

- 2026-09-08 — **v1.9.1**: interjections while generating, draggable session sidebar width, project adopted the MIT License.
- 2026-08-29 — **v1.9.0**: first-launch setup wizard with a preinstalled starter Agent, GLM-5.3-Flash and GLM-5.3-Highspeed model support.
- 2026-08-24 — **v1.8.0**: official brand icons for providers and models, bilingual voice preview texts, unified marketplace card heights.
- 2026-08-19 — **v1.7.1**: automatic retry on transient LLM connection errors, automatic fallback for invalid workspaces, message previews in the session list, GLM-5.3 support.
- 2026-08-17 — **v1.7.0**: Agent Apps — a new App tab in the marketplace for one-click install of mini-apps, with an app panel and app notifications.
- 2026-07-23 — **v1.6.5**: in-app update checker, macOS code signing and notarization, companion panel rebuilt as a sliding pane, abort generation support.
- 2026-07-19 — **v1.6.4**: Intel Mac support, QR scan-to-pair remote connection, Kimi K3 support, cross-fade pose transitions, redesigned thought-process timeline.
- 2026-07-04 — **v1.6.0**: merged multi-step thinking, persistent API error messages, Git Bash on Windows, one-click uv runtime download, optimistic chat loading.
- 2026-06-28 — **v1.5.0**: new Agent Marketplace for browsing and installing skills & MCP tools; unified HTTP error handling; design system rollout.
- 2026-06-23 — **v1.4.0**: redesigned desktop UI (TitleBar + dual sidebars), agent chat with multi-session management, dedicated skill/tool assignment views.
- 2026-06-04 — **v1.2.3**: fixed message leaking and cross-session voice playback on session switch; improved skill path resolution and system prompt editing.
- 2026-05-24 — **v1.2.1**: Windows platform support, bilingual (CN/EN) UI.
- 2026-05-20 — **v1.2.0**: agent portrait & background management, companion panel animations and window drag-region fixes.
- 2026-05-18 — **v1.1.9**: pose management in Agent Editor, window drag support.
- 2026-05-17 — **v1.1.8**: voice cloning, Web Fetch tool, multi-language TTS translation.
- 2026-05-12 — **v1.1.5**: Web Fetch tool, MCP entry, global icon refresh.
- 2026-05-03 — **v1.1.0**: first iterative release, foundational agent architecture and CI/CD.
- 2026-04-27 — **v1.0.x**: first public release of Persona Agent (MVP).

</details>

→ [Full release history](https://github.com/Code-MonkeyZhang/persona-agent/releases)

## 🚀 Quick Start

This project supports macOS and Windows. Download the installer from [GitHub Releases](https://github.com/Code-MonkeyZhang/persona-agent/releases):

| Platform            | Download                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| macOS Apple Silicon | [Download installer](https://github.com/Code-MonkeyZhang/persona-agent/releases)                                 |
| macOS Intel         | [Download installer](https://github.com/Code-MonkeyZhang/persona-agent/releases)                                 |
| Windows x64         | [Download installer](https://github.com/Code-MonkeyZhang/persona-agent/releases)                                 |

Open the DMG file and drag the app to Applications; on Windows, run the exe installer and follow the prompts.

> [!NOTE]
> The Windows installer is unsigned, so SmartScreen may show a "Windows protected your PC" warning on first launch. Click "More info" → "Run anyway" to continue.

## 🎨 Agent Customization

Every agent in Persona is one of a kind: portraits, backgrounds, and voice — all defined by you.

### Portraits

Customize character portraits and conversation backgrounds for each agent. The agent automatically switches expressions based on conversation mood.

<table>
  <tr>
    <td align="center"><b>Default</b></td>
    <td align="center"><b>Very Happy</b></td>
    <td align="center"><b>Yandere</b></td>
    <td align="center"><b>Background</b></td>
  </tr>
  <tr>
    <td><img src="assets/default.png" width="200" /></td>
    <td><img src="assets/非常喜欢.png" width="200" /></td>
    <td><img src="assets/病娇.png" width="200" /></td>
    <td><img src="assets/background.png" width="200" /></td>
  </tr>
</table>

### Voice

Give your agent a voice of its own. Voice synthesis is powered by MiniMax TTS, with a range of preset voices and support for cloning a custom voice from recorded audio.

> 💡 Want more agent templates, skills, and tools? Head to the **Agent Marketplace** below.

## 🛒 Agent Marketplace

Persona ships with a built-in marketplace to browse, install, and manage Agent templates, Skills, and MCP tools in one place. The catalog is driven by the open-source [persona-agent-marketplace](https://github.com/Code-MonkeyZhang/persona-agent-marketplace) repo, and supports one-click install with MCP and Skill assignment to a specific agent.

- **Agents**: curated character templates, ready to use after install
- **Skills**: inject domain knowledge and capabilities into your agents
- **Tools (MCP)**: connect external services like Notion and GitHub, with OAuth support

## 📱 Mobile

Persona also provides an iOS and Android mobile app. Connect to your agent via Cloudflare Tunnel and chat anytime, anywhere.

<table>
  <tr>
    <td align="center"><b>Mobile Demo</b></td>
    <td align="center"><b>Conversation</b></td>
    <td align="center"><b>Agent Details</b></td>
  </tr>
  <tr>
    <td><img src="assets/mobile-agent.gif" width="250" /></td>
    <td><img src="assets/normal-conversation.gif" width="250" /></td>
    <td><img src="assets/agent-detail.gif" width="250" /></td>
  </tr>
</table>

→ [View Mobile Project](https://github.com/Code-MonkeyZhang/persona-agent-mobile)

## 💜 Acknowledgements

### Reference Projects

- [Chatbox](https://github.com/chatboxai/chatbox) — Cross-platform AI desktop client
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — Full-featured AI assistant with multi-provider LLM support
- [Halo](https://github.com/openkursar/hello-halo) — 24/7 autonomous desktop AI Agent with digital human avatar system
- [OpenCode](https://github.com/anomalyco/opencode) — AI coding tool, important reference for architecture and build system
- [ZcChat](https://github.com/Zao-chen/ZcChat) — Desktop AI companion with Galgame-style character portraits and voice interaction

### Technical Dependencies

- [pi-ai](https://github.com/mariozechner/pi-ai) — Unified multi-provider LLM API
- [lobe-icons](https://github.com/lobehub/lobe-icons) — Brand icons for providers and models
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP tool extension protocol
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — Secure tunneling for remote access
- [MiniMax](https://www.minimaxi.com/) — TTS voice synthesis
