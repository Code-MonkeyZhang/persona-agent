---
title: 模型接入
description: 配置模型供应商的 API Key 并管理凭据
---

Persona Agent 支持十七家模型供应商，包括 Anthropic、OpenAI、Google、DeepSeek、Moonshot AI、MiniMax、OpenRouter、xAI、Z.AI、Kimi Coding、HuggingFace、OpenAI Codex、小米等。你只需要接入其中任何一家就能开始使用。

## 获取并验证 Key

- 到所选供应商的官网注册并创建 API Key。设置页的模型供应商面板里有各家官方文档的直达链接。
- 打开设置，进入模型供应商标签页，在左栏选择供应商。
- 粘贴 Key 后点击验证。验证方式是向该供应商发送一条极短的测试消息，通过后 Key 才会保存，界面不会回显已保存的密钥。

## 管理已保存的 Key

已配置的供应商会置顶并带绿色标记。可以随时删除某家的 Key，删除后需要重新验证才能再次使用。

## Key 存在哪里

所有 Key 以文件形式保存在本机数据目录的 config 子目录下，不上传任何服务器。数据目录的具体位置见[同步机制与数据本位](/docs/remote/sync)。

## 默认模型的选择

每家供应商验证通过后，应用会列出它可用的模型清单。具体绑定哪个模型是按角色配置的，在[角色编辑](/docs/agents/create)的模型配置里选择。
