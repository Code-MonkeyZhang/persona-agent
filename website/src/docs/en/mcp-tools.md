---
title: MCP Tools
description: Meet the MCP-based capability extensions
---

## What Are MCP Tools

Tools are the actions an agent can actually execute. Reading and writing files, running commands, fetching web pages, all of it runs on tools. Persona Agent's tool system speaks the MCP protocol, which opens the door to the vast community tool ecosystem.

### Connection Types

Tool services support three connection forms.

- Local process, where the tool runs as a child process on your machine, the most common form.
- HTTP, connecting directly to an online tool service.
- OAuth, connecting to services that require account authorization, with an authorization flow on first use.

### Relation to Built-in Tools

The app ships with a set of everyday tools ready to use, see [Built-in Tools](/docs/mcp-tools). MCP tools are the add-on part installed on demand, and to the agent the two are indistinguishable.

### Difference from Skills

Skills are knowledge the model reads, changing how it thinks. Tools are real running capabilities, deciding what it can do. A skill teaches the character your report format, a tool is what lets it actually open files. See [Overview](/docs/getting-started).

When ready, move on to [Install and Authorize](/docs/mcp-tools).

## Install and Authorize

### Installing

Click the compass at the bottom of the agent bar to enter the marketplace, switch to the tools tab, and click install on the tool you need. The app downloads the tool code, writes its connection config, and registers it into the global tool pool.

Tools in the marketplace cover scenarios like scheduling, notes, health, and music, a few example cards below.

![TickTick](/docs-images/tool-dida365.png) ![Notion](/docs-images/tool-notion.png) ![Health Manager](/docs-images/tool-health.png)

### Manual Assignment After Install

An installed tool is not automatically granted to any character. You assign it per agent on the tool assignment page, see [Assign to Agents](/docs/mcp-tools). This is by design so every character only touches the abilities you allow.

### OAuth Authorization

Tools that need an account pop an authorization flow on first connection. Follow the page to log in and grant. Credentials are stored locally, the app auto-reconnects after drops, and you re-run the flow when authorization expires for long.

### Runtime Dependencies

Community-built tools are mostly written in Python and need the uv runtime. The environment card in settings detects its state and offers one-click download when missing. On Windows, command tools additionally need Git Bash, also with detection and guidance, see [Environment Issues](/docs/troubleshooting).

### Uninstalling

Go to the installed tools tab in settings, select a tool, and uninstall from its detail panel via the button that appears on hover.

## Assign to Agents

Tool authorization is controlled per agent, the same tool can be granted to A and withheld from B.

### Entering the Page

Click the tools navigation item in the session sidebar and the central area switches to the tool assignment page with a two-column layout.

### Assign and Revoke

- The left column splits tools into assigned and unassigned groups. Click a tool in unassigned to add it to the current agent.
- Tools in assigned can be removed at any time, effective immediately.
- The right column shows the selected tool's details, including what it can do.

### How It Takes Effect

Assignment state is injected into the agent's runtime context, so it always knows which tools it currently holds. Adjusting mid-conversation reflects on the very next turn.

For the full tool inventory see [Built-in Tools](/docs/mcp-tools), and for the skill side see [Agent Skills](/docs/skills).

## Built-in Tools

The app ships with seven built-in tools that need no installation and can be assigned right away.

### Files and Commands

- **read** reads file contents.
- **write** writes files.
- **edit** makes partial modifications to a file.
- **bash** executes terminal commands.
- **bash-output** reads a command's output.
- **bash-kill** terminates a running command.

Command tools execute inside the working directory, which can be set both in agent configuration and in the input box, see [Create and Edit](/docs/agents).

### Network

- **webfetch** fetches web page content so the agent can read online material.

### Appearance

Two more tools serve the companion experience, letting the agent autonomously switch pose expressions, see [Appearance](/docs/agents). These need no manual assignment.

### Platform Differences

On Windows, command tools rely on Git Bash for the shell environment. The app detects it automatically and offers a download link when missing, see [Environment Issues](/docs/troubleshooting) for troubleshooting.
