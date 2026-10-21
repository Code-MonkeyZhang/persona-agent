---
title: Model Access
description: Configure provider API keys and manage credentials
---

Persona Agent supports seventeen model providers, including Anthropic, OpenAI, Google, DeepSeek, Moonshot AI, MiniMax, OpenRouter, xAI, Z.AI, Kimi Coding, HuggingFace, OpenAI Codex, and Xiaomi. You only need any one of them to get started.

## Get and Verify a Key

- Register on the provider's website and create an API key. The provider panel in settings links to each provider's official docs.
- Open settings, go to the Model Providers tab, and select a provider in the left column.
- Paste the key and click verify. Verification sends one tiny test message to the provider, and the key is saved only after it passes. Saved keys are never displayed back in the interface.

## Manage Saved Keys

Configured providers are pinned to the top with a green marker. You can delete any provider's key at any time and re-verify to use it again.

## Where Keys Live

All keys are stored as files in the config folder of your local data directory and are never uploaded anywhere. See [Sync and Data Locality](/docs/remote/sync) for the exact location.

## Choosing the Default Model

Once a provider is verified, the app lists its available models. Which model to bind is configured per agent in the model section of the [agent editor](/docs/agents/create).
