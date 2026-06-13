# Agent Console

[![CI](https://github.com/mangeshraut712/agent-console/actions/workflows/ci.yml/badge.svg)](https://github.com/mangeshraut712/agent-console/actions/workflows/ci.yml)

**Open-source debug UI** for AI agent backends over WebSocket — streaming tokens, tool calls, live protocol trace, context diffs, and reconnect/`RESUME` recovery.

Point it at **any server** that implements the [Agent Console protocol](docs/ADOPTING.md), or use the bundled mock `agent-server`.

**Stack:** Next.js 15 · React 19 · TypeScript · no Vercel AI SDK

## Why use this?

- **Debug agents visually** — see every `TOKEN`, `TOOL_CALL`, `PING`, and `CONTEXT_SNAPSHOT` in a timeline
- **Plug in your backend** — configurable `ws://` / `wss://` URL (env + UI + localStorage)
- **Production patterns** — seq reorder buffer, RAF-coalesced streaming, exponential backoff, `RESUME(last_seq)`
- **Export traces** — download JSON for bug reports and regression analysis
- **One-command demo** — `npm run stack` (Docker Compose)

![Stream with tool call](docs/screenshot-stream-tool.png)

## Quick start

### Option A — Docker (recommended for new users)

```bash
git clone https://github.com/mangeshraut712/agent-console.git
cd agent-console
npm run stack
```

Open http://localhost:3000 → **Connect** → pick a quick prompt or type a message.

### Option B — Local dev

```bash
npm install
cp .env.example .env.local   # optional

# Terminal 1
cd agent-server && npm install && npm start

# Terminal 2
npm run dev
```

Before Connect (single WS client only):

```bash
bash scripts/ensure-clean-ws.sh
```

## Configuration

| Method | Example |
|--------|---------|
| UI | Set **Agent WebSocket URL** in the header |
| Env | `NEXT_PUBLIC_WS_URL=wss://api.example.com/ws` |
| Default | `ws://localhost:4747/ws` |

See [.env.example](.env.example).

## Connect your own agent

Read **[docs/ADOPTING.md](docs/ADOPTING.md)** for the wire protocol, client obligations, and verification steps.

```bash
WS_URL=ws://your-server:8080/ws npm run verify:server
```

## Features

- Configurable WebSocket endpoint
- Quick-prompt chips (matches mock server keywords)
- Trace export (JSON)
- Clear session without disconnecting
- Protocol error banner
- 37+ unit tests · `npm run verify:server`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run stack` | Docker Compose — web + agent-server |
| `npm test` | Unit tests |
| `npm run verify:server` | Protocol compliance script |
| `npm run verify:chaos` | Chaos-mode verification |

## Project layout

```
src/lib/           WebSocket client, reorder buffer, state machine
src/components/    UI panels
agent-server/      Reference mock backend (Docker)
docs/              ADOPTING.md, screenshots, chaos demo video
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome.

## Background

Originally built for the [Alchemyst June 2026 Full Stack AI](https://github.com/Alchemyst-ai/hiring) assignment. Design notes in [DECISIONS.md](DECISIONS.md).

## License

MIT — see [LICENSE](LICENSE).
