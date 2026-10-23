# Devpost draft — Incident Desk

Working copy for the Nebius x NVIDIA Global AI Hackathon submission. Facts below match the repo. Replay is what runs without an API key. Live Nemotron was not executed against Token Factory while writing this, because signup asked for a card and no key was available.

## Title

Incident Desk

## Tagline

Nemotron plans an on-call investigation, and the trace shows whether the conclusion is backed by evidence.

## Inspiration

The debugging console in this repo already showed tokens, tool calls, and context diffs for a scripted agent. Watching a script is a weak demo of an agent. The interesting question on a real page is narrower: did the model look at the right service, did it read the log line it is quoting, and did it recommend something a person can do? Incident Desk is that question, with Nemotron as the planner.

## What it does

An operator picks one of three seeded Northwind alerts, or types a checkout, login, or queue alert. Nemotron, through Nebius Token Factory, decides the next tool: service health, log search, the on-call runbook, or a Tavily web search. The screen keeps the planner text, the tool cards, the verdict, and a scorecard.

The scorecard checks six things on the finished trace: the required tools were called, the cause text matches the seeded incident, an evidence id from the seed is cited, a recommended action is present, service names stay in the catalog, and the tool count stays between 1 and 8. Each check is pass or fail. There is no accuracy percentage.

Without `NEBIUS_API_KEY`, the desk plays a recorded trace. The banner says Replay, and the trace says Nemotron was not called. That path is what a reviewer can run today. With the key set on the server, the Live control calls `nvidia/nemotron-3-super-120b-a12b` at `https://api.tokenfactory.nebius.com/v1/chat/completions`. Service health and logs are still the Northwind seed either way. Tavily is called only when `TAVILY_API_KEY` is set; otherwise `web_search` returns an error the model can see and continue past.

The older WebSocket protocol console is still in the app. Ordering, dedupe, and reconnect behavior are unchanged.

## How we built it

The UI is the existing Next.js console. A desk transport feeds it the same protocol events the WebSocket client already renders, so tool cards and the trace timeline did not have to be reinvented.

The new loop lives in `src/agent/`. `src/agent/nebius.ts` is a small OpenAI-compatible client: bearer token from `NEBIUS_API_KEY`, model id from `src/agent/constants.ts`, `POST /chat/completions`. The loop in `src/agent/loop.ts` sends the alert, the tool schemas, and later the tool results. Reasoning text from the response is stored on a planner snapshot. The last answer is parsed for a JSON verdict.

Replay is a separate generator, `src/agent/replay.ts`. It uses the same tool implementations against the seed, so the recorded trace and a future live run talk about the same evidence ids. It does not call Nebius or Tavily.

Tests mock `fetch`. They check the URL, the bearer header, a missing key, tool-call parsing, the hand-back of tool results, Tavily, the step budget, and that each recorded incident passes the scorecard with zero network calls.

Docker Compose is `npm run deploy`. The same route can be deployed on Vercel; the function timeout is set to 60 seconds because a multi-step plan can outlive a short serverless limit.

## Challenges

Token Factory signup asked for a bank card, so the live client could not be exercised against the real API during this change. The client is still the real request path, and the missing-key error is explicit instead of a silent fallback into replay.

Nemotron's reasoning shows up as `reasoning_content` on some responses and `reasoning` on others, so the parser accepts both. Tool arguments sometimes arrive as a JSON string and sometimes as an object.

The static GitHub Pages build cannot host the API route. The pages script stashes `src/app/api` for the export and restores it afterward. That build only ships replay.

## Accomplishments that we're proud of

The planner, the tools, and the scorecard are one loop. A reviewer can see the reason a tool was chosen, the payload that came back, and which checks that trace passed.

Replay is labeled in the banner, in the context snapshot, and in the web-search payload. It is not presented as a live model response.

The protocol console still passes its existing ordering rules. The new work sits on top of that UI instead of replacing the reorder buffer.

## What we learned

A debug console is more convincing when the agent can be wrong in a way you can point at. The scorecard is a small version of that: it fails a trace that skipped the runbook or cited an evidence id the tools never returned.

Putting the model call behind one module made the missing-key behavior testable without a network. That was the difference between a button that errors mysteriously and a button that stays disabled until the server reports a key.

## What's next

Run the live path once a Token Factory key is on the server, and keep the traces that come back. The scorecard can then compare live runs to the same seeded incidents.

Replace the Northwind seed with read-only adapters for a real status page, log query, and runbook. The tool schema can stay.

Add a second pass where a failed check is shown to Nemotron as feedback, so a missed tool is retried inside the same investigation.

## Built with

- NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`)
- Nebius Token Factory (OpenAI-compatible chat completions)
- Tavily Search API (optional `web_search` tool)
- Next.js, React, TypeScript
- The existing Agent Console protocol (WebSocket mock server still used for the protocol console)
