# AGENTS.md — agent-console

Guidance for coding agents working in this repo.

## What this is

A Next.js 15 / React 19 real-time debug UI for AI agent backends over WebSocket: streaming tokens,
tool-call cards, and a live protocol trace. `agent-server/` is the mock backend used for demos and
verification. Design rationale is in `DECISIONS.md`; read it before touching ordering, reconnection,
or rendering code.

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
