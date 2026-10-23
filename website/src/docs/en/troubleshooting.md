---
title: Troubleshooting
description: Detecting and installing Git Bash and the uv runtime
---

## Environment Issues

### Windows Needs Git Bash

Built-in command tools get their terminal environment from Git Bash on Windows. The app detects it automatically and the environment card in general settings shows the state.

- Ready means no action is needed.
- Missing shows a download link, install and return to the app to re-detect.

### The uv Runtime

Community-built MCP tools are mostly written in Python and need the uv runtime to launch. The environment card detects it too.

- When missing, one-click download installs it with no manual environment setup.
- Failed downloads are usually network issues, click retry, or check your proxy and try again.

### The Logging Toggle

General settings has an enable logging switch. Turn it on before reproducing a problem, then grab the files from the log directory, see [Logs and Diagnostics](/docs/troubleshooting).

If the environment is fine but problems persist, see [Common Questions](/docs/troubleshooting).

## Common Questions

### The Agent Does Not Reply

The most common cause is a missing or invalid model key. Confirm the target provider carries the configured marker on the model providers page in settings and re-verify if needed, see [Model Access](/docs/getting-started).

### Key Verification Keeps Failing

- Check the key for stray spaces and newlines.
- Confirm the key is active, funded, and allowed to use the target model.
- Provider outages happen, try again later.

### No Voice

Confirm the voice service is configured and the voice toggle in the chat header is on, see [Voice Playback](/docs/agents). Long replies are summarized before playback, a short delay is normal.

### A Tool Does Not Work

- Confirm the tool is assigned to the current agent, see [Assign to Agents](/docs/mcp-tools).
- For community tools confirm uv is ready, and on Windows Git Bash, see [Environment Issues](/docs/troubleshooting).
- OAuth tools expire after long idle periods, run the authorization flow again.

### Changing the Interface Language

Switch between Chinese and English in general settings, effective immediately.

### Watching the Wizard Again

General settings has a replay first-run wizard button, enter and exit freely.

### The Phone Cannot Reach the Host

Confirm the tunnel is running on the host and the public address has not changed. If it has, update it in device management, see [Device Management](/docs/remote).

## Logs and Diagnostics

### Enabling Logs

General settings has an enable logging switch that can stay off by default. When something needs investigating, flip it on, reproduce the problem once, and the log files record the full scene.

### Finding the Files

The storage paths card in general settings has a log directory row, the open button on its right takes you straight there. Logs are archived by date, take the files covering the problem period.

### Diagnosis Order

With the logs in hand, read them in this order.

- Look for error level entries first, they usually point at the failing step directly.
- For model call failures, follow lines mentioning the provider name.
- For tool problems, look at the tool process startup and output records.

### What to Attach When Reporting

When reporting to the community, attach the log files from the problem period, your operating system, and the app version, visible in general settings. Sanitize sensitive information yourself, file paths may appear in logs.

## Contact Support

### Filing Issues

Issue reports live in the GitHub repository's issue tracker. Search for existing reports before filing. Include reproduction steps, your system and app versions, and [logs](/docs/troubleshooting) where relevant.

### Joining the Community

Persona Agent is an open-source project and the repository welcomes code contributions and discussion alike. Marketplace content is maintained in a separate marketplace repository.

### Other Channels

Business and partnership matters can go through the contact in the site footer. Feature suggestions are welcome as issues too, describing the use case makes an idea far easier to adopt than a bare feature name.
