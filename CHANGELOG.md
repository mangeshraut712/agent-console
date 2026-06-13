# Changelog

## [1.2.0] — 2026-06-13

### Added
- Multi-turn trace and context history (no longer cleared on each message)
- Dark mode via `prefers-color-scheme`
- Mobile sidebar tabs (Trace / Context)
- Reconnect/resume status banner
- Tool JSON copy buttons
- Malformed message detection (`parseMessage` + user error)
- Protocol verification job in CI
- `parse_error` WebSocket event handling

### Improved
- TOOL_RESULT ↔ chat bidirectional highlight via `resultTraceEventId`
- Trace export includes connection metadata and `processedSeq`
- Keyboard-accessible trace rows
- Clear session confirmation
- Context scrubber accessibility labels
- `ReorderBuffer.flush()` on `STREAM_END` for stuck out-of-order messages

### Removed
- Unused `ConnectionIndicator` component

## [1.1.0] — 2026-06-13

### Added
- Configurable WebSocket URL (env, UI, localStorage)
- Docker Compose (`npm run stack`)
- Quick prompts, trace export, clear session
- `docs/ADOPTING.md`, `CONTRIBUTING.md`, `.env.example`

## [1.0.0] — 2026-06-13

- Initial open-source release: streaming chat, tool ACK, trace timeline, context diff, reconnect/RESUME, chaos demo
