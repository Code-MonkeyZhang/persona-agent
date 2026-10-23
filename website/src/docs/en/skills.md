---
title: Agent Skills
description: Meet the prompt-injected knowledge extensions
---

## What Are Skills

A skill is an instruction manual written for your agent. At its core it is a structured Markdown document, and once assigned, its full text is injected into the agent's system prompt so the character behaves as the document prescribes.

### How Skills Take Effect

- After assignment, the skill's full text enters the available skills block of the system prompt.
- The character is required to honestly master these skills and proactively report what it can do in conversation.
- During a run, the app informs the character of any change in its skill list, keeping its self-awareness in sync.

### What Skills Suit

- Teaching a fixed workflow, like how to compile the daily report.
- Injecting domain knowledge, like your project background and glossary.
- Prescribing output formats, like a weekly report template.

### Difference from Tools

Skills change how a character thinks, tools decide what it can do. A skill is pure text and executes nothing, actual file reads or command runs rely on [tools](/docs/mcp-tools).

When ready, move on to [Installing Skills](/docs/skills).

## Installing Skills

### Installing

Click the compass at the bottom of the agent bar to enter the marketplace, switch to the skills tab, browse or search, and click install. Skill files download into your global skill directory with their source recorded. Skills cover scenarios like journaling, weather, and news, a few example cards below.

![Diary Writing](/docs-images/skill-diary.svg) ![Weather Query](/docs-images/skill-weather.svg)

- Installed skills show an installed marker and never download twice.
- Skills land in the global library, and still need to be assigned to a specific agent to take effect, see [Assign and Effect](/docs/skills).

### Reading the Full Text

Every skill is just a document, and you can read it in full to confirm the content before assigning. The skill detail panel opens a full-text reader as a large overlay, closed with Esc or by clicking the backdrop.

### Uninstalling

Go to the installed skills tab in settings, select a skill, and uninstall from its detail panel. Removing a skill from the global library disables it for every agent at once.

## Assign and Effect

Like tools, skills are assigned per agent.

### Assignment Entry

Click the skills navigation item in the session sidebar and the central area switches to the skill assignment page. The left column lists the global library, clicking adds a skill to the current agent, clicking again removes it, and the right column shows the selected skill's details.

### How It Works

Assigning injects the skill's full text into the system prompt. Two mechanics are worth knowing.

- **Instant injection**: the moment assignment completes, the character's knowledge is updated, no restart or refresh needed.
- **Honest inventory**: the character is required to truthfully state its skill list in conversation, so you can quiz it any time.

### Combine with a Workspace

Skills teach the method, tools do the actual work. Give the character a [default workspace](/docs/agents) plus the matching [tools](/docs/mcp-tools), and skills turn into real outcomes.
