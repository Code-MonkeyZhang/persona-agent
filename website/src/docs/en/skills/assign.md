---
title: Assign and Effect
description: Check skills per agent and understand the injection mechanism
---

Like tools, skills are assigned per agent.

## Assignment Entry

Click the skills navigation item in the session sidebar and the central area switches to the skill assignment page. The left column lists the global library, clicking adds a skill to the current agent, clicking again removes it, and the right column shows the selected skill's details.

## How It Works

Assigning injects the skill's full text into the system prompt. Two mechanics are worth knowing.

- **Instant injection**: the moment assignment completes, the character's knowledge is updated, no restart or refresh needed.
- **Honest inventory**: the character is required to truthfully state its skill list in conversation, so you can quiz it any time.

## Combine with a Workspace

Skills teach the method, tools do the actual work. Give the character a [default workspace](/docs/agents/create) plus the matching [tools](/docs/mcp-tools/assign), and skills turn into real outcomes.
