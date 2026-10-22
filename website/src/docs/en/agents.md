---
title: Agents
description: Meet Arona, the built-in agent
---

## Preset Agent

The app ships with one preset agent, Arona, ready to use out of the box. She is created automatically on first launch, follows your system language, and comes with both Chinese and English profiles.

![Arona](/docs-images/arona-avatar.png)

### What Arona Can Do

Arona arrives with a complete default configuration, including personality, pose artwork, and a base model binding. You can chat with her immediately without any setup and treat her as your starting point for learning the app.

### Switching Agents

The agent bar on the far left lists all your characters, click an avatar to switch. Agents with unread messages show a small dot. Both the session sidebar and the content area follow the switch.

### Delete and Restore

The preset agent can be deleted and will not be auto-created again on the next launch. To get her back, reinstall from the marketplace, see [Installing Agents from the Marketplace](/docs/agents).

To create your own character, head to [Create and Edit](/docs/agents).

## Create and Edit

Click the add button at the bottom of the agent bar to create a new character, or enter the editor from any existing one. The editor consists of six cards, and every setting is private to that single agent, characters never share configuration.

### Basic Info

Name and description. The name appears in the agent bar tooltip and the session sidebar header, the description is a note for yourself.

### Appearance

Upload avatar, pose art, and background images. The avatar is used in the agent bar, poses and backgrounds power the [companion panel](/docs/agents).

### Model Configuration

- Default model: pick from your verified providers, deciding which model this character thinks with.
- Max steps: the upper bound of consecutive action steps per reply, from one to fifty. Higher limits complete complex tasks better and cost more.

### Chat Configuration

- Compression threshold: controls when context compression kicks in, lower values start earlier, see [Context and Memory](/docs/agents).
- Memory interval: how often the agent consolidates long-term memory, in minutes.

### Voice

Choose from preset or cloned voices for this character and set its narration language, see [Voice](/docs/agents).

### Workspace

Set the default working directory for this character, the root for file and command tools. It can also be switched temporarily during a chat.

### Deleting an Agent

The delete button sits at the bottom of the editor. Confirming removes the agent along with its sessions and memory, permanently.

## Context and Memory

Every agent maintains its own context and memory. Three layers of machinery keep long conversations under control, and you never need to clean up manually.

### Context Compression

Once a conversation passes the agent's compression threshold, the app summarizes earlier exchanges in the background and appends the summary to history. The original text is never deleted, it simply stops being sent to the model in full.

### Overflow Protection

Even if compression cannot keep up, when the estimated tokens of unsummarized content approach ninety percent of the model window, the app trims from the oldest complete turn so requests never fail for being too long.

### Long-Term Memory

Each character has a memory consolidation rhythm. At the configured interval, or when unprocessed memory entries pile up, the agent distills what is worth remembering into a memory document and keeps referencing it in the persistent chat. Think of it as the character's own notebook.

### Where Memory Lives

Memory files are stored in the agent's own folder inside your local data directory, alongside its configuration, and become available on other devices through [remote access](/docs/remote).

With memory understood, move on to [Appearance](/docs/agents) and dress up your character visually.

## Appearance

A character's visual identity has three parts, all configured in the appearance card of the editor.

### Avatar

Upload a square image as the avatar. It shows in the agent bar, the session sidebar header, and elsewhere.

### Poses and Expressions

Pose art is the character's full-body artwork in the companion panel. You can upload multiple pose images for one character, and the app treats them as different expression states. During conversations the agent autonomously picks which pose to display through the expression tool, happy, stern, or shy, making the companion feel alive.

### Background

The background serves as the backdrop of the companion panel and combines with the pose art into a complete scene. Landscape illustrations or any picture you like works well.

### See It in Action

Once configured, switch to the companion panel from the chat header to see the result. Replies float over the scene as bubbles and expressions change with the conversation, see [Your First Chat](/docs/getting-started).

## Installing Agents from the Marketplace

Besides creating your own, you can install complete community-made agent packs directly from the marketplace. Characters there come in all styles.

### Entering the Marketplace

Click the compass icon at the bottom of the agent bar, switch to the agents tab, and filter by name with the search box on top.

### Installing

Click install on a card. The app downloads the character's complete package, including configuration, prompt, and artwork, then creates it as your new agent in the agent bar.

- Previously installed characters carry an installed marker and never install twice.
- Installed characters have exactly the same standing as self-made ones, you can open the editor and change any of their settings.

### Uninstalling

Marketplace characters do not need a separate uninstall, delete them like any ordinary character in the [editor](/docs/agents).

Installation of the other three marketplace categories, tools, apps, and skills, is covered in their own chapters.
