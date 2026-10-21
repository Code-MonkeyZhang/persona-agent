---
title: Environment Issues
description: Detecting and installing Git Bash and the uv runtime
---

## Windows Needs Git Bash

Built-in command tools get their terminal environment from Git Bash on Windows. The app detects it automatically and the environment card in general settings shows the state.

- Ready means no action is needed.
- Missing shows a download link, install and return to the app to re-detect.

## The uv Runtime

Community-built MCP tools are mostly written in Python and need the uv runtime to launch. The environment card detects it too.

- When missing, one-click download installs it with no manual environment setup.
- Failed downloads are usually network issues, click retry, or check your proxy and try again.

## The Logging Toggle

General settings has an enable logging switch. Turn it on before reproducing a problem, then grab the files from the log directory, see [Logs and Diagnostics](/docs/troubleshooting/logs).

If the environment is fine but problems persist, see [Common Questions](/docs/troubleshooting/common).
