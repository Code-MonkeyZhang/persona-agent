---
title: Context and Memory
description: How compression, overflow protection, and long-term memory work
---

Every agent maintains its own context and memory. Three layers of machinery keep long conversations under control, and you never need to clean up manually.

## Context Compression

Once a conversation passes the agent's compression threshold, the app summarizes earlier exchanges in the background and appends the summary to history. The original text is never deleted, it simply stops being sent to the model in full.

## Overflow Protection

Even if compression cannot keep up, when the estimated tokens of unsummarized content approach ninety percent of the model window, the app trims from the oldest complete turn so requests never fail for being too long.

## Long-Term Memory

Each character has a memory consolidation rhythm. At the configured interval, or when unprocessed memory entries pile up, the agent distills what is worth remembering into a memory document and keeps referencing it in the persistent chat. Think of it as the character's own notebook.

## Where Memory Lives

Memory files are stored in the agent's own folder inside your local data directory, alongside its configuration, and become available on other devices through [remote access](/docs/remote/sync).

With memory understood, move on to [Appearance](/docs/agents/appearance) and dress up your character visually.
