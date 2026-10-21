---
title: Assign to Agents
description: Check tools on and off per agent on the assignment page
---

Tool authorization is controlled per agent, the same tool can be granted to A and withheld from B.

## Entering the Page

Click the tools navigation item in the session sidebar and the central area switches to the tool assignment page with a two-column layout.

## Assign and Revoke

- The left column splits tools into assigned and unassigned groups. Click a tool in unassigned to add it to the current agent.
- Tools in assigned can be removed at any time, effective immediately.
- The right column shows the selected tool's details, including what it can do.

## How It Takes Effect

Assignment state is injected into the agent's runtime context, so it always knows which tools it currently holds. Adjusting mid-conversation reflects on the very next turn.

For the full tool inventory see [Built-in Tools](/docs/mcp-tools/builtin), and for the skill side see [Agent Skills](/docs/skills/assign).
