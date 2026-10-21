---
title: Install and Authorize
description: Install tool services from the marketplace and complete authorization
---

## Installing

Click the compass at the bottom of the agent bar to enter the marketplace, switch to the tools tab, and click install on the tool you need. The app downloads the tool code, writes its connection config, and registers it into the global tool pool.

Tools in the marketplace cover scenarios like scheduling, notes, health, and music, a few example cards below.

![TickTick](/docs-images/tool-dida365.png) ![Notion](/docs-images/tool-notion.png) ![Health Manager](/docs-images/tool-health.png)

## Manual Assignment After Install

An installed tool is not automatically granted to any character. You assign it per agent on the tool assignment page, see [Assign to Agents](/docs/mcp-tools/assign). This is by design so every character only touches the abilities you allow.

## OAuth Authorization

Tools that need an account pop an authorization flow on first connection. Follow the page to log in and grant. Credentials are stored locally, the app auto-reconnects after drops, and you re-run the flow when authorization expires for long.

## Runtime Dependencies

Community-built tools are mostly written in Python and need the uv runtime. The environment card in settings detects its state and offers one-click download when missing. On Windows, command tools additionally need Git Bash, also with detection and guidance, see [Environment Issues](/docs/troubleshooting/environment).

## Uninstalling

Go to the installed tools tab in settings, select a tool, and uninstall from its detail panel via the button that appears on hover.
