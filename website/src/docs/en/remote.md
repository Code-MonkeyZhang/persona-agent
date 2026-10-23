---
title: Remote Access
description: Expose your host through a tunnel
---

## Remote Access

Remote access lets you use your home Persona Agent from a phone or another computer while the data stays on your own host.

### Starting the Tunnel

Click the route icon at the bottom of the agent bar to open the remote access panel. Click start and the app establishes a tunnel through Cloudflare, mapping the local service to a public address.

### Using the Public Address

Once the tunnel is up, the assigned public address is shown with one-click copy. Open it in any device's browser to connect. The address stays valid until the tunnel stops.

### Stop Any Time

Click stop when remote access is not needed. The public address stops working immediately and nothing stays exposed. Opening the tunnel on demand is the soundest habit.

With the tunnel running, move on to [pairing your phone](/docs/remote).

## Phone Pairing

With the tunnel running, pairing a phone takes one scan.

### Scan to Connect

The remote access panel shows a pairing QR code. Scan it with your phone's browser or camera and the phone connects straight to your host, joining the device list.

### What Happens on First Connect

The first connection pulls a complete data snapshot to the phone, including your agents, sessions, and configuration. How long this takes depends on data volume, afterwards only incremental changes sync, which is fast.

### Later Use

A paired device never needs to scan again. Pick it from the device list to switch connections, see [Device Management](/docs/remote).

## Device Management

### Device List

Click the device icon at the bottom of the agent bar to open the list popover. Every paired device appears here, clicking an entry switches the connected host, and the bottom entry opens the full management page.

### Management Operations

On the device management page you can do the following per device.

- Create a new connection by entering a host address manually.
- Rename a device to something easy to recognize.
- Edit the connection address when the host's network or address changes.
- Delete a device, which also clears its local mirror data on this machine.

### What Deleting Means

Deleting only affects that device's own credentials and cache, nothing on your host is touched. Pair again to resume use.

## Sync and Data Locality

### How Sync Works

- **First connection**: the device pulls a complete snapshot, a full copy of the host's data.
- **Continuous sync**: every subsequent change flows to the device as an increment, aligned in real time.
- **Recovery**: changes queued during a disconnection are replayed in order on reconnect, nothing is lost.

### Data Locality

Persona Agent has no cloud service. Your sessions, agents, memories, and configuration all live on your own host, other devices are remote views. Outbound network requests fall into three categories only, model provider APIs, the marketplace and update checks on GitHub. The app carries no telemetry or analytics of any kind.

### Local Storage at a Glance

Data concentrates under the user data directory, with subdirectories for the database, configuration, agent folders, skills, tools, attachments, wallpapers, and logs. The storage paths card in general settings lists six of them, each openable with one click.

### Privacy Notes

- Model keys and authorization credentials live as files in the config directory, mind your host's access security.
- The remote access tunnel opens and closes at your will, nothing is exposed once stopped.
- To wipe everything, delete the entire data directory and the app reinitializes like a fresh install.
