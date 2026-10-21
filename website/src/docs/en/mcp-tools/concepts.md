---
title: What Are MCP Tools
description: Meet the MCP-based capability extensions
---

Tools are the actions an agent can actually execute. Reading and writing files, running commands, fetching web pages, all of it runs on tools. Persona Agent's tool system speaks the MCP protocol, which opens the door to the vast community tool ecosystem.

## Connection Types

Tool services support three connection forms.

- Local process, where the tool runs as a child process on your machine, the most common form.
- HTTP, connecting directly to an online tool service.
- OAuth, connecting to services that require account authorization, with an authorization flow on first use.

## Relation to Built-in Tools

The app ships with a set of everyday tools ready to use, see [Built-in Tools](/docs/mcp-tools/builtin). MCP tools are the add-on part installed on demand, and to the agent the two are indistinguishable.

## Difference from Skills

Skills are knowledge the model reads, changing how it thinks. Tools are real running capabilities, deciding what it can do. A skill teaches the character your report format, a tool is what lets it actually open files. See [Overview](/docs/getting-started/intro).

When ready, move on to [Install and Authorize](/docs/mcp-tools/install).
