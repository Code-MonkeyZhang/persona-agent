---
title: What Are Skills
description: Meet the prompt-injected knowledge extensions
---

A skill is an instruction manual written for your agent. At its core it is a structured Markdown document, and once assigned, its full text is injected into the agent's system prompt so the character behaves as the document prescribes.

## How Skills Take Effect

- After assignment, the skill's full text enters the available skills block of the system prompt.
- The character is required to honestly master these skills and proactively report what it can do in conversation.
- During a run, the app informs the character of any change in its skill list, keeping its self-awareness in sync.

## What Skills Suit

- Teaching a fixed workflow, like how to compile the daily report.
- Injecting domain knowledge, like your project background and glossary.
- Prescribing output formats, like a weekly report template.

## Difference from Tools

Skills change how a character thinks, tools decide what it can do. A skill is pure text and executes nothing, actual file reads or command runs rely on [tools](/docs/mcp-tools/concepts).

When ready, move on to [Installing Skills](/docs/skills/install).
