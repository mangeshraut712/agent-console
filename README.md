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

**Requirements:** Node.js 20+ and npm 10+. Docker is optional but recommended for a zero-config demo.

### Option A — Docker (recommended for new users)

```bash
git clone https://github.com/mangeshraut712/agent-console.git
cd agent-console
npm run stack
```

Open http://localhost:3000 → **Connect** → pick a quick prompt or type a message.

### Option B — Local dev

```bash
git clone https://github.com/mangeshraut712/agent-console.git
cd agent-console
npm run setup          # installs root + agent-server and builds the mock backend
cp .env.example .env.local   # optional

# Terminal 1
cd agent-server && npm start

# Terminal 2
npm run dev
```

Before Connect (only one WebSocket client at a time on the mock server):

```bash
bash scripts/ensure-clean-ws.sh
```

### Troubleshooting

| Problem | Fix |
|---------|-----|
| Connect fails / stuck on connecting | Run `bash scripts/ensure-clean-ws.sh`, then retry |
| Port 4747 already in use | Stop other agent-server processes or change port in `agent-server` |
| `npm run verify:server` fails | Ensure agent-server is running: `curl http://localhost:4747/health` |
| Docker stack won't start | Run `npm run stack:down` then `npm run stack` again |

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
- Multi-turn trace and context history (persists across messages)
- Dark mode (`prefers-color-scheme`) and mobile sidebar tabs
- Tool JSON copy buttons · reconnect/resume status banner
- 41+ unit tests · CI runs `verify:server` against mock backend

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install all deps + build agent-server (first-time setup) |
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
