# AGENTS.md — agent-console

Guidance for coding agents working in this repo.

## What this is

Incident Desk is an on-call investigation UI. The Paytm integration uses Sarvam AI
(`sarvam-105b-conversations`) through the server-side V1 chat completions API.
`INCIDENT_PROVIDER` pins sarvam or nebius; absent that, a Sarvam key takes priority.
The original Nebius client remains supported. The loop and replay live in `src/agent/`.
The HTTP entry is `src/app/api/investigate/route.ts`. Replay is explicitly labeled
and makes no model call. Live provider errors must never silently fall back to replay.
Keys stay server-side, including `SARVAM_API_KEY` and optional `TAVILY_API_KEY`.

The same repo still has the real-time debug UI for agent backends over WebSocket: streaming
tokens, tool-call cards, and a live protocol trace. `agent-server/` is the mock backend used
for protocol demos and verification. Design rationale is in `DECISIONS.md`; read it before
touching ordering, reconnection, or rendering code.

## Setup

Node.js 20+, npm 10+.

```bash
npm run setup              # installs root + agent-server, builds the mock backend
cd agent-server && npm start          # terminal 1 (health: http://localhost:4747/health)
npm run dev                            # terminal 2, http://localhost:3000
# or: npm run stack                    # Docker compose, zero-config
```

## Verification (run before proposing changes)

```bash
npm run typecheck
npm run test               # vitest
npm run verify:server      # protocol conformance against the running mock server
npm run verify:chaos       # chaos mode: reordering, duplicates, disconnects
```

Run `verify:server` against a normal server. Before `verify:chaos`, stop it and
restart with `npm start --prefix agent-server -- --mode chaos`; the verifier
rejects a mode mismatch. Custom ports use WS_URL, LOG_URL, RESET_URL and HEALTH_URL.

Static demo build for GitHub Pages: `npm run build:pages` (uses `demo://agent`, no server).

## Invariants — do not break

1. **Ordering and dedupe live in `ReorderBuffer`** (Map keyed by `seq`, `nextExpectedSeq` counter).
   Duplicates (`seq < nextExpectedSeq`) are dropped; gaps are buffered (max 200). Do not replace with
   sort-on-every-tick.
2. **`processedSeq` means rendered, not received.** It advances per processed message so mid-stream
   reconnects resume correctly; the first message on a new connection is `RESUME { last_seq }`.
3. **`TOOL_ACK` fires once per tool call** (guarded by a ref). Replayed `TOOL_CALL`s must not double-ACK.
4. **No layout shift on tool interruption:** streaming text is block-level; tool cards stack below it
   with deterministic dimensions; no height transitions.
5. Refs are mutated during message processing and flushed to React state periodically — do not
   `setState` per token.

If `npm run verify:chaos` fails after your change, the change is wrong until proven otherwise.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
