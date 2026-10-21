---
title: Built-in Tools
description: The seven built-in tools ready out of the box
---

The app ships with seven built-in tools that need no installation and can be assigned right away.

## Files and Commands

- **read** reads file contents.
- **write** writes files.
- **edit** makes partial modifications to a file.
- **bash** executes terminal commands.
- **bash-output** reads a command's output.
- **bash-kill** terminates a running command.

Command tools execute inside the working directory, which can be set both in agent configuration and in the input box, see [Create and Edit](/docs/agents/create).

## Network

- **webfetch** fetches web page content so the agent can read online material.

## Appearance

Two more tools serve the companion experience, letting the agent autonomously switch pose expressions, see [Appearance](/docs/agents/appearance). These need no manual assignment.

## Platform Differences

On Windows, command tools rely on Git Bash for the shell environment. The app detects it automatically and offers a download link when missing, see [Environment Issues](/docs/troubleshooting/environment) for troubleshooting.
