---
title: Common Questions
description: Frequent problems and how to handle them
---

## The Agent Does Not Reply

The most common cause is a missing or invalid model key. Confirm the target provider carries the configured marker on the model providers page in settings and re-verify if needed, see [Model Access](/docs/getting-started/model-access).

## Key Verification Keeps Failing

- Check the key for stray spaces and newlines.
- Confirm the key is active, funded, and allowed to use the target model.
- Provider outages happen, try again later.

## No Voice

Confirm the voice service is configured and the voice toggle in the chat header is on, see [Voice Playback](/docs/voice/playback). Long replies are summarized before playback, a short delay is normal.

## A Tool Does Not Work

- Confirm the tool is assigned to the current agent, see [Assign to Agents](/docs/mcp-tools/assign).
- For community tools confirm uv is ready, and on Windows Git Bash, see [Environment Issues](/docs/troubleshooting/environment).
- OAuth tools expire after long idle periods, run the authorization flow again.

## Changing the Interface Language

Switch between Chinese and English in general settings, effective immediately.

## Watching the Wizard Again

General settings has a replay first-run wizard button, enter and exit freely.

## The Phone Cannot Reach the Host

Confirm the tunnel is running on the host and the public address has not changed. If it has, update it in device management, see [Device Management](/docs/remote/devices).
