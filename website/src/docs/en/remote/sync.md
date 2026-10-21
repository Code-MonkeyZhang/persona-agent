---
title: Sync and Data Locality
description: Snapshot plus change stream, with data never leaving your host
---

## How Sync Works

- **First connection**: the device pulls a complete snapshot, a full copy of the host's data.
- **Continuous sync**: every subsequent change flows to the device as an increment, aligned in real time.
- **Recovery**: changes queued during a disconnection are replayed in order on reconnect, nothing is lost.

## Data Locality

Persona Agent has no cloud service. Your sessions, agents, memories, and configuration all live on your own host, other devices are remote views. Outbound network requests fall into three categories only, model provider APIs, the marketplace and update checks on GitHub. The app carries no telemetry or analytics of any kind.

## Local Storage at a Glance

Data concentrates under the user data directory, with subdirectories for the database, configuration, agent folders, skills, tools, attachments, wallpapers, and logs. The storage paths card in general settings lists six of them, each openable with one click.

## Privacy Notes

- Model keys and authorization credentials live as files in the config directory, mind your host's access security.
- The remote access tunnel opens and closes at your will, nothing is exposed once stopped.
- To wipe everything, delete the entire data directory and the app reinitializes like a fresh install.
