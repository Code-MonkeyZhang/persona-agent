---
title: Logs and Diagnostics
description: Turn on logging and locate the problem scene
---

## Enabling Logs

General settings has an enable logging switch that can stay off by default. When something needs investigating, flip it on, reproduce the problem once, and the log files record the full scene.

## Finding the Files

The storage paths card in general settings has a log directory row, the open button on its right takes you straight there. Logs are archived by date, take the files covering the problem period.

## Diagnosis Order

With the logs in hand, read them in this order.

- Look for error level entries first, they usually point at the failing step directly.
- For model call failures, follow lines mentioning the provider name.
- For tool problems, look at the tool process startup and output records.

## What to Attach When Reporting

When reporting to the community, attach the log files from the problem period, your operating system, and the app version, visible in general settings. Sanitize sensitive information yourself, file paths may appear in logs.
