#!/usr/bin/env python3
"""
Cloudflare Tunnel connectivity & API tester for Nano Agent Server.

Usage:
  python tunnel_check.py

Then enter the tunnel URL when prompted.

Tests:
  1. DNS resolution
  2. HTTPS /health
  3. HTTPS /api/status
  4. HTTPS /api/tunnel/status
  5. WebSocket /ws (connect, ping/pong, subscribe/unsubscribe)
  6. POST /api/tunnel/start
  7. POST /api/tunnel/stop
"""

import json
import os
import socket
import ssl
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from dataclasses import dataclass, field

try:
    import websocket

    HAS_WS = True
except ImportError:
    HAS_WS = False

HTTP_TIMEOUT = 15
WS_TIMEOUT = 10


def _build_opener() -> urllib.request.OpenerDirector:
    handler = urllib.request.ProxyHandler({})
    return urllib.request.build_opener(handler)


_opener = _build_opener()
urllib.request.install_opener(_opener)


@dataclass
class Result:
    name: str
    passed: bool = False
    detail: str = ""
    response: dict | None = field(default=None, repr=False)

    def __str__(self) -> str:
        icon = "\u2713" if self.passed else "\u2717"
        line = f"  [{icon}] {self.name}"
        if self.detail:
            line += f"  -- {self.detail}"
        return line


def resolve_dns(host: str) -> Result:
    r = Result("DNS Resolution")
    try:
        addrs = socket.getaddrinfo(host, None, socket.AF_INET)
        ips = {a[4][0] for a in addrs}
        r.passed = True
        r.detail = f"resolved to {', '.join(ips)}"
    except socket.gaierror as e:
        r.detail = str(e)
    return r


def http_get(url: str, label: str) -> Result:
    r = Result(label)
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            body = json.loads(resp.read().decode())
            r.passed = True
            r.response = body
            r.detail = (
                f"HTTP {resp.status} | {json.dumps(body, ensure_ascii=False)[:120]}"
            )
    except urllib.error.HTTPError as e:
        r.response = None
        r.detail = f"HTTP {e.code} -- {e.reason}"
    except Exception as e:
        r.detail = f"{type(e).__name__}: {e}"
    return r


def http_post(url: str, label: str) -> Result:
    r = Result(label)
    try:
        data = b""
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            body = json.loads(resp.read().decode())
            r.passed = True
            r.response = body
            r.detail = (
                f"HTTP {resp.status} | {json.dumps(body, ensure_ascii=False)[:120]}"
            )
    except urllib.error.HTTPError as e:
        raw = ""
        try:
            raw = e.read().decode()[:200]
        except Exception:
            pass
        r.detail = f"HTTP {e.code} -- {e.reason} | {raw}"
    except Exception as e:
        r.detail = f"{type(e).__name__}: {e}"
    return r


def ws_test(ws_url: str) -> list[Result]:
    results: list[Result] = []
    if not HAS_WS:
        results.append(
            Result(
                "WebSocket",
                detail="websocket-client not installed, run: pip install websocket-client",
            )
        )
        return results

    r_connect = Result("WebSocket /ws connect")
    r_ping = Result("WebSocket ping/pong")
    r_sub = Result("WebSocket subscribe")
    r_unsub = Result("WebSocket unsubscribe")

    try:
        ws = websocket.create_connection(
            ws_url,
            timeout=WS_TIMEOUT,
            http_proxy_host=None,
            http_proxy_port=None,
        )

        connected_msg = ws.recv()
        connected = json.loads(connected_msg)
        if connected.get("type") == "connected" and connected.get("clientId"):
            r_connect.passed = True
            r_connect.detail = f"clientId={connected['clientId']}"
        else:
            r_connect.detail = f"unexpected: {connected_msg[:100]}"

        ws.send(json.dumps({"type": "ping"}))
        pong = json.loads(ws.recv())
        if pong.get("type") == "pong":
            r_ping.passed = True
        else:
            r_ping.detail = f"unexpected: {json.dumps(pong)[:100]}"

        test_session = "test-session-001"
        ws.send(
            json.dumps({"type": "subscribe", "payload": {"sessionId": test_session}})
        )
        sub_msg = json.loads(ws.recv())
        if (
            sub_msg.get("type") == "subscribed"
            and sub_msg.get("sessionId") == test_session
        ):
            r_sub.passed = True
            r_sub.detail = f"sessionId={test_session}"
        else:
            r_sub.detail = f"unexpected: {json.dumps(sub_msg)[:100]}"

        ws.send(
            json.dumps({"type": "unsubscribe", "payload": {"sessionId": test_session}})
        )
        r_unsub.passed = True
        r_unsub.detail = f"sessionId={test_session} (no ack expected)"

        ws.close()
    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        if not r_connect.detail:
            r_connect.detail = detail
    results.extend([r_connect, r_ping, r_sub, r_unsub])
    return results


def main() -> None:
    print("Nano Agent Tunnel Check")
    print("-" * 60)
    base = (
        input("Enter tunnel URL (e.g. https://xxx.trycloudflare.com): ")
        .strip()
        .rstrip("/")
    )
    if not base:
        print("No URL provided, exiting.")
        sys.exit(1)

    parsed = urllib.parse.urlparse(base)
    host = parsed.hostname or ""
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"

    print(f"\nTarget: {base}")
    print(f"Host:   {host}")
    print(f"Proxy:  bypassed (NO_PROXY=*)")
    print(f"SSL CA: {ssl.get_default_verify_paths().cafile or 'system default'}")
    print("-" * 60)

    all_results: list[Result] = []

    all_results.append(resolve_dns(host))

    all_results.append(http_get(f"{base}/health", "GET /health"))
    all_results.append(http_get(f"{base}/api/status", "GET /api/status"))
    all_results.append(http_get(f"{base}/api/tunnel/status", "GET /api/tunnel/status"))

    all_results.extend(ws_test(f"{ws_scheme}://{parsed.netloc}/ws"))

    all_results.append(http_get(f"{base}/api/providers", "GET /api/providers"))
    all_results.append(http_get(f"{base}/api/config", "GET /api/config"))

    print()
    for r in all_results:
        print(r)

    passed = sum(1 for r in all_results if r.passed)
    total = len(all_results)
    print("-" * 60)
    print(f"Results: {passed}/{total} passed")
    if passed == total:
        print("All good!")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
