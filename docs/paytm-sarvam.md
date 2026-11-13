# Incident Desk — Paytm / Sarvam integration

## Pitch review

The submitted seven-slide [Paytm pitch](paytm-pitch.pdf) presents an autonomous
on-call teammate under Track 3. The code matches its seeded checkout, login and
queue investigations, evidence trace, read-only tools and six-check scorecard.
The original submission identified Nemotron on Nebius on slide 4; the revised
deck and this checkout now use Sarvam as the preferred provider. The [PDF](paytm-pitch.pdf) and [editable PowerPoint](paytm-pitch.pptx) have been
updated for Sarvam.

Updated pitch narration:

> Incident Desk is an AI on-call teammate for payment and checkout incidents.
> Sarvam AI plans the investigation, selects read-only tools, and turns their
> evidence into a verdict an operator can inspect. The demo uses seeded Northwind
> telemetry, not Paytm production data. Every tool result stays visible, and a
> person remains responsible for remediation.

Slide 4 now names **Sarvam AI / sarvam-105b-conversations, server-side chat
completions with function calling**. Slides 3, 6 and 7 retain explicit replay and
live-credit limitations. Do not claim a completed live Sarvam demo, production payment
integration, measured time savings, customers, or revenue. The original replay
score is not a measured Sarvam score. UPI timeouts and settlement monitoring remain
roadmap items; they were not added by this integration.

## Run locally

From the repository directory:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3010
```

Open http://127.0.0.1:3010. For live mode, copy `.env.example` to `.env.local`
only if that file does not already exist, and fill in SARVAM_API_KEY. Local `.env`
files are ignored by Git. Keep keys server-side. Replay works without credits. Choose Live
Sarvam AI to make a real request once credits are available. Optional Tavily web
search needs its own key; health/log/runbook tools use local seed data.

## Verification and limits (2026-11-13–14)

- TypeScript, all 138 tests, and production build passed.
- Normal and actual chaos-mode protocol verification passed after the reconnect
  fix on 14 November. Interrupted scripts now continue after RESUME through
  STREAM_END. Deterministic tests cover drops before the first frame, at the tool
  call, and before the tool result. The verifier now fails on scenario timeouts,
  earlier log violations, and mismatched server modes.
- Browser replay check completed with a visible replay disclaimer, five tool calls,
  a verdict and 6/6 scorecard checks. This is not a live Sarvam result.
- Mocked Sarvam integration verifies endpoint, authentication, model, actual tool
  execution, tool-result feedback, verdict metadata, secret handling, and no fallback.
- A real request exposed a documentation/service mismatch: the service rejected
  `reasoning_effort: none`. The client now sends `low`, covered by a regression check.
- The corrected real checkout investigation returned `SARVAM_CREDITS` / HTTP 402:
  no credits available. No model verdict was generated and no replay substituted.
- The supplied devSemble email says credits are provisioned the day after
  registration. This does not establish that the account has received credits.

API contract: https://docs.sarvam.ai/api-reference/chat/chat-completions-v1

Sarvam errors are sanitized server-side. Provider selection never switches to
Nebius after a failure. The existing Nebius path remains available through
`INCIDENT_PROVIDER=nebius` with its own server key.

## Demo and rehearsal

See [the demo script](demo-script.md) for the three-minute presentation.
All three replays were verified at desktop and mobile widths on the server app
and the prebuilt static demo. These checks make no live model requests.

The [public Pages site](https://mangeshraut712.github.io/agent-console/) serves
replay only. No Sarvam API key or server-side API route is shipped to Pages.
