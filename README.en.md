<p align="right">
<a href="README.md">简体中文</a> | English
</p>

<div align="center">

<img src="assets/logo-rounded.png" width="150" height="150" alt="Persona Agent" />

# Persona Agent

A personal AI Agent app that lets you bring your characters to life with custom portraits, voice synthesis, and personality settings. It also supports MCP tools and Agent Skills!

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/Platform-macOS-informational)
[![Release](https://img.shields.io/github/v/release/Code-MonkeyZhang/persona-agent?include_prereleases)](https://github.com/Code-MonkeyZhang/persona-agent/releases)

</div>

## Screenshots

<table>
  <tr>
    <td><img src="assets/screenshot-main.jpg" width="400" /></td>
    <td><img src="assets/screenshot-companion.jpg" width="400" /></td>
  </tr>
</table>

## Key Features

- **17+ LLM Providers** — DeepSeek, MiniMax, Zhipu, Kimi, OpenAI, Anthropic, Google, OpenRouter, and more
- **Multi-Agent Management** — Create multiple independent Agents, each with its own character settings, model configuration, MCP tools, Agent Skills, and conversation history
- **Custom Agent Portraits** — Add custom character portraits and backgrounds. Agents automatically switch expressions based on conversation context
- **Voice Synthesis** — TTS voice synthesis powered by MiniMax API. Combined with portraits and backgrounds, it brings your characters to life!
- **MCP & Agent Skills** — Configure custom MCP tools and Agent Skills for each Agent, including OAuth-based MCP services (Notion, GitHub)
- **Remote Access** — Built-in Cloudflare Tunnel for connecting from the mobile app

## Installation

This project supports macOS. Windows version is under development. Download the installer from [GitHub Releases](https://github.com/Code-MonkeyZhang/persona-agent/releases):

| Platform            | File                              |
| ------------------- | --------------------------------- |
| macOS Apple Silicon | `Persona-mac-arm64-{version}.dmg` |
| macOS Intel         | `Persona-mac-x64-{version}.dmg`   |

Open the DMG file and drag the app to Applications.

> [!NOTE]
> If you see a "Persona.app is damaged and can't be opened" alert on macOS, run the following command in Terminal:
>
> ```bash
> xattr -cr /Applications/Persona.app
> ```
> After running this command, the app should open normally.

### Custom Agent Portraits

Persona supports custom character portraits and conversation background images for each Agent. The Agent automatically switches expressions based on conversation mood.

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

**Portrait Requirements:**

- Format: PNG/JPG/JPEG/GIF/WebP (PNG with transparent background recommended)
- Recommended size: approximately 1000 × 2100
- Must include a `default.png` (default expression); other expression filenames are up to you
- Location: `agents/{id}/assets/pose/`

> [!NOTE]
> Filenames are read by the Agent to determine expression switching. Use meaningful names like `happy.png`, `surprised.png`, `shy.png`, etc.

**Background Requirements:**

- Format: PNG/JPG/JPEG/GIF/WebP
- Recommended size: approximately 1500 × 2700
- Location: `agents/{id}/assets/backgrounds/` (place one image in the directory, filename is arbitrary)

> More Agent portrait resources will be shared on [GitHub Discussions](https://github.com/Code-MonkeyZhang/persona-agent/discussions)!

## Mobile Companion

Persona also provides an iOS and Android mobile app. Connect to your Agent via Cloudflare Tunnel and chat with your Agent anytime, anywhere.

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

## Contact

This project is developed and maintained by [Zhang Yufeng](https://github.com/Code-MonkeyZhang). For questions, ideas, or collaboration, feel free to reach out at [yufengzhang483@gmail.com](mailto:yufengzhang483@gmail.com).

## Acknowledgements

### Reference Projects

- [Chatbox](https://github.com/chatboxai/chatbox) — Cross-platform AI desktop client
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — Full-featured AI assistant with multi-provider LLM support
- [Halo](https://github.com/openkursar/hello-halo) — 24/7 autonomous desktop AI Agent with digital human avatar system
- [OpenCode](https://github.com/anomalyco/opencode) — AI coding tool, important reference for architecture and build system
- [ZcChat](https://github.com/Zao-chen/ZcChat) — Desktop AI companion with Galgame-style character portraits and voice interaction

### Technical Dependencies

- [pi-ai](https://github.com/mariozechner/pi-ai) — Unified multi-provider LLM API
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP tool extension protocol
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — Secure tunneling for remote access
- [MiniMax](https://www.minimaxi.com/) — TTS voice synthesis
