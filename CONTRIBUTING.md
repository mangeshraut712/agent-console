# Contributing

Thanks for improving Agent Console! This project is meant to be a **reusable debug UI** for agent backends, not a one-off assignment.

## Development setup

```bash
git clone https://github.com/mangeshraut712/agent-console.git
cd agent-console
npm run setup

# Terminal 1 — mock agent
cd agent-server && npm start

# Terminal 2 — frontend
npm run dev
```

Before Connect: `bash scripts/ensure-clean-ws.sh`

## Checks before PR

```bash
npm test
npm run typecheck
npm run build
npm run verify:server   # requires agent-server on :4747
```

## What we welcome

- Bug fixes for reconnect, reorder buffer, or UI edge cases
- Better adoption docs and examples
- Accessibility improvements
- Optional adapters for popular agent frameworks (without pulling heavy SDK deps into core)
- Docker / CI improvements

## What to avoid

- Modifying `agent-server/` behavior (it's the reference fixture; extend via docs instead)
- Adding Vercel AI SDK or opaque streaming helpers to the core client — keep the protocol visible
- Breaking changes to the wire protocol without a versioned doc update

## Code style

- Match existing patterns: protocol logic in `src/lib/`, presentational components in `src/components/`
- Unit test pure functions (`ReorderBuffer`, `diff`, `config`, etc.)
- Keep PRs focused — one concern per PR when possible

## Questions

Open a [GitHub issue](https://github.com/mangeshraut712/agent-console/issues) for design questions before large changes.
