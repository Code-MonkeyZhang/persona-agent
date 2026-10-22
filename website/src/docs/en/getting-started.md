---
title: Getting Started
description: Meet the five core concepts and the main window layout
---

## Overview and Core Concepts

Persona Agent is an open-source personal agent desktop app. You build your own AI characters locally, let them handle daily tasks through conversation, and extend their abilities with skills, tools, and apps. All data stays on your own machine.

### Five Core Concepts

- **Agent**: your AI character. Each agent has its own personality, appearance, model configuration, and memory, fully isolated from others.
- **Session**: a conversation with an agent. Every agent has one persistent chat session you can always continue, and you can open task sessions as needed.
- **Skill**: a knowledge pack written for the agent, essentially a document. Once assigned, the agent adjusts its behavior following the document.
- **Tool**: an action the agent can actually execute, such as reading files, running commands, or fetching web pages. Tools connect through the MCP protocol.
- **App**: a tool with its own interface. Installed apps appear in the in-app phone panel and the agent can interact with them.

How the last three differ and how to install them is covered in the concept pages of [Agent Apps](/docs/agent-apps), [MCP Tools](/docs/mcp-tools), and [Agent Skills](/docs/skills).

### Main Window Layout

The app uses a single window divided into regions from left to right.

- The far left is the agent bar, a column of avatars for all your characters, with marketplace, devices, remote access, and settings entries at the bottom.
- The middle is the session sidebar, with the chat entry and tool and skill navigation on top and the session list below.
- The right main area switches with navigation between chat, agent editor, tool assignment, and skill assignment views.
- The far right can expand into a phone panel that runs installed Agent Apps.

### Next

When you are ready, head to [Install and Update](/docs/getting-started).

## Install and Update

### Download

Visit the [download page](/#download) on the official site and pick the package for your system. Official builds are provided for macOS and Windows.

- macOS offers separate builds for Apple Silicon and Intel. Download the dmg file and drag the app into your Applications folder.
- Windows provides an installer. Run it and follow the wizard.

### First Launch Notes

If macOS warns that the developer cannot be verified on first launch, open System Settings, go to Privacy and Security, and choose Open Anyway. If Windows shows a security prompt, choose Run Anyway.

### Checking for Updates

Updates are handled manually in settings. Open the settings entry at the bottom of the agent bar, find the Version and Update card in general settings, and click Check for Updates. When a new version is found, click Download Update and then Restart and Install, with a progress bar during download. The app never downloads or installs anything in the background, the pace is entirely yours.

For update or installation problems, see [Environment Issues](/docs/troubleshooting) and [Common Questions](/docs/troubleshooting).

## Model Access

Persona Agent supports seventeen model providers, including Anthropic, OpenAI, Google, DeepSeek, Moonshot AI, MiniMax, OpenRouter, xAI, Z.AI, Kimi Coding, HuggingFace, OpenAI Codex, and Xiaomi. You only need any one of them to get started.

### Get and Verify a Key

- Register on the provider's website and create an API key. The provider panel in settings links to each provider's official docs.
- Open settings, go to the Model Providers tab, and select a provider in the left column.
- Paste the key and click verify. Verification sends one tiny test message to the provider, and the key is saved only after it passes. Saved keys are never displayed back in the interface.

### Manage Saved Keys

Configured providers are pinned to the top with a green marker. You can delete any provider's key at any time and re-verify to use it again.

### Where Keys Live

All keys are stored as files in the config folder of your local data directory and are never uploaded anywhere. See [Sync and Data Locality](/docs/remote) for the exact location.

### Choosing the Default Model

Once a provider is verified, the app lists its available models. Which model to bind is configured per agent in the model section of the [agent editor](/docs/agents).
