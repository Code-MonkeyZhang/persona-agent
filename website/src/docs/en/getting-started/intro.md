---
title: Overview and Core Concepts
description: Meet the five core concepts and the main window layout
---

Persona Agent is an open-source personal agent desktop app. You build your own AI characters locally, let them handle daily tasks through conversation, and extend their abilities with skills, tools, and apps. All data stays on your own machine.

## Five Core Concepts

- **Agent**: your AI character. Each agent has its own personality, appearance, model configuration, and memory, fully isolated from others.
- **Session**: a conversation with an agent. Every agent has one persistent chat session you can always continue, and you can open task sessions as needed.
- **Skill**: a knowledge pack written for the agent, essentially a document. Once assigned, the agent adjusts its behavior following the document.
- **Tool**: an action the agent can actually execute, such as reading files, running commands, or fetching web pages. Tools connect through the MCP protocol.
- **App**: a tool with its own interface. Installed apps appear in the in-app phone panel and the agent can interact with them.

How the last three differ and how to install them is covered in the concept pages of [Agent Apps](/docs/agent-apps/concepts), [MCP Tools](/docs/mcp-tools/concepts), and [Agent Skills](/docs/skills/concepts).

## Main Window Layout

The app uses a single window divided into regions from left to right.

- The far left is the agent bar, a column of avatars for all your characters, with marketplace, devices, remote access, and settings entries at the bottom.
- The middle is the session sidebar, with the chat entry and tool and skill navigation on top and the session list below.
- The right main area switches with navigation between chat, agent editor, tool assignment, and skill assignment views.
- The far right can expand into a phone panel that runs installed Agent Apps.

## Next

When you are ready, head to [Install and Update](/docs/getting-started/install).
