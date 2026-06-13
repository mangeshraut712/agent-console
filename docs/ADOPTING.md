# Adopting Agent Console for your backend

Agent Console is a **reference UI** for debugging agent servers that speak a simple WebSocket protocol. Use it with the bundled mock server or **point it at your own agent**.

## 1. Run the full stack (fastest)

```bash
cp .env.example .env.local   # optional — defaults work with Docker
npm run stack                # agent-server + web on :3000 / :4747
```

Open http://localhost:3000, enter `ws://localhost:4747/ws` (pre-filled), click **Connect**.

## 2. Connect to your own agent

Your backend must implement the protocol below on a WebSocket endpoint. In the UI, set **Agent WebSocket URL** to e.g. `wss://your-api.example.com/agent/ws`.

Environment variable (build-time):

```bash
NEXT_PUBLIC_WS_URL=wss://your-api.example.com/agent/ws
```

The UI also persists the URL in `localStorage` per browser.

## Protocol summary

### Server → client (every message has monotonic `seq`)

| type | Purpose |
|------|---------|
| `TOKEN` | Stream text chunk (`text`, `stream_id`) |
| `TOOL_CALL` | Tool invocation mid-stream (`call_id`, `tool_name`, `args`, `stream_id`) |
| `TOOL_RESULT` | Tool output (`call_id`, `result`, `stream_id`) |
| `CONTEXT_SNAPSHOT` | Agent context blob (`context_id`, `data`) |
| `STREAM_END` | End of stream (`stream_id`) |
| `PING` | Heartbeat (`challenge`) — client must reply within 3s |
| `ERROR` | Protocol error (`code`, `message`) |

### Client → server

| type | When |
|------|------|
| `USER_MESSAGE` | User sends chat (`content`) |
| `PONG` | Reply to `PING` (`echo` = challenge) |
| `TOOL_ACK` | After rendering a tool card (`call_id`) |
| `RESUME` | After reconnect (`last_seq`) |

### Client responsibilities

1. **Reorder** messages by `seq` (out-of-order and duplicates happen in the wild).
2. **Respond to PING** with `PONG` within 3 seconds.
3. **Send TOOL_ACK** when a tool call is shown (server may wait for this).
4. **Track `last_seq`** and send `RESUME` on reconnect.

See `agent-server/README.md` for the reference implementation and chaos mode.

## Verify your backend

```bash
WS_URL=ws://localhost:8080/ws npm run verify:server
```

Or against chaos mode:

```bash
npm run verify:chaos
```

Then inspect server-side logs:

```bash
curl -s http://localhost:4747/log | python3 -m json.tool
```

## Export traces for debugging

Use **Export trace** in the UI to download JSON with all protocol events, messages, and context snapshots — useful for bug reports and regression tests.

## Extending the UI

| Goal | Start here |
|------|------------|
| Change rendering | `src/components/ChatPanel.tsx`, `ToolCard.tsx` |
| Protocol / state | `src/lib/useAgentConsole.ts`, `websocketManager.ts` |
| New message types | `src/lib/types.ts` + `processMessage` switch |
| Custom diff view | `src/lib/diff.ts`, `ContextInspector.tsx` |

Pull requests welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
