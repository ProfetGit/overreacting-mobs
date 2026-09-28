#!/usr/bin/env python3
"""Talks to the Blockbench MCP plugin over plain HTTP (localhost:3000/bb-mcp), for sessions whose MCP link to it failed
(Blockbench wasn't running when the session started). Streamable HTTP JSON-RPC: initialize -> Mcp-Session-Id ->
notifications/initialized -> tools/call.
Usage: bbhttp.py tools [name] | bbhttp.py eval '<js>' | bbhttp.py evalfile <file.js> | bbhttp.py call <tool> '<json args>'"""
import json
import sys
import urllib.request

URL = "http://localhost:3000/bb-mcp"


def post(payload, sid=None):
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if sid:
        h["Mcp-Session-Id"] = sid
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=900) as r:
        body = r.read().decode()
        sid = r.headers.get("Mcp-Session-Id") or sid
    if body.lstrip().startswith("{"):
        return sid, [json.loads(body)]
    return sid, [json.loads(l[5:]) for l in body.splitlines() if l.startswith("data:") and l[5:].strip()]


def session():
    sid, _ = post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                   "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "bbhttp", "version": "1"}}})
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return sid


def call(tool, args):
    sid = session()
    _, msgs = post({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool, "arguments": args}}, sid)
    for m in msgs:
        if m.get("id") == 2:
            if "error" in m:
                return "ERROR " + json.dumps(m["error"])
            text = "\n".join(c.get("text", json.dumps(c)[:200]) for c in m["result"].get("content", []))
            return ("ISERROR " if m["result"].get("isError") else "") + text
    return "no result: " + json.dumps(msgs)[:500]


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "tools":
        sid = session()
        _, msgs = post({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}, sid)
        for t in (t for m in msgs for t in m.get("result", {}).get("tools", [])):
            print(t["name"], "-", (t.get("description") or "")[:100].replace("\n", " "))
            if len(sys.argv) > 2 and t["name"] == sys.argv[2]:
                print(json.dumps(t.get("inputSchema"), indent=1))
    elif cmd == "eval":
        print(call("risky_eval", {"code": sys.argv[2]}))
    elif cmd == "evalfile":
        print(call("risky_eval", {"code": open(sys.argv[2]).read()}))
    elif cmd == "call":
        print(call(sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}))
