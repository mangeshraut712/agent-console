# Demo script — under 3 minutes

Record the seeded replay. Say that out loud in the first shot. Do not switch to Live unless `NEBIUS_API_KEY` is set and you have already seen one successful live run. If you do show Live, say that the health and log numbers are still the Northwind seed.

Have the app running at http://localhost:3000 (`npm run dev` or `npm run deploy`). Leave the source on **Replay**. Use a desktop window wide enough to show the trace beside the conversation.

## Shot 1 — 0:00 to 0:18 — The desk

Show the Incident Desk header, the model id `nvidia/nemotron-3-super-120b-a12b`, and the base URL.

Say: "This is Incident Desk. Nemotron is the planner for an on-call investigation. What you're about to see is the recorded replay, so we can run it with no API key. The banner will say Replay, and Nemotron is not being called."

Point at the disabled Live control and the sentence that says the key is unset.

## Shot 2 — 0:18 to 0:32 — Pick the checkout page

Click **Checkout p99 after payments-7f3c**.

Say: "Checkout latency jumped in the same minute as deploy payments-7f3c. The agent has to decide where to look."

## Shot 3 — 0:32 to 1:15 — Plan and tools

Keep the Planner card and the tool cards in frame. Pause when the first plan step is on screen, then when `lookup_service_health`, `search_logs`, and `read_runbook` complete.

Say: "The plan says it will read checkout-api and payments-db before the logs. The health card shows the database at 98 of 100 connections. The log card is the pool timeout, evidence id ev-checkout-pool. The runbook says to roll the pool back before adding API replicas."

Scroll the trace timeline enough to show those events as rows, not only as cards.

## Shot 4 — 1:15 to 1:40 — Verdict and scorecard

When the verdict card appears, read the likely cause and the action in one sentence. Then show the scorecard at 6 of 6, or whatever it actually shows. Do not claim a number you cannot see.

Say: "The verdict cites the seeded evidence ids, and the scorecard checks the tools, the cause, the evidence, and that it recommended an action. This is a check against the fixture, not a production accuracy rate."

## Shot 5 — 1:40 to 2:10 — The auth incident and web search

Click **Login 500s from identity-gateway**. When `web_search` completes, open the result.

Say: "This one needs a public status page. In replay, web search is a recorded example. The payload says Tavily was not called. The log still has the expired certificate, ev-idp-cert."

If you have `TAVILY_API_KEY` and a Nebius key and you already verified Live, you can cut to a second take here. Label it Live and say the status page is a real Tavily response. Skip that take otherwise.

## Shot 6 — 2:10 to 2:28 — Export

Click **Export trace**. Show the downloaded JSON for a moment: a `TOOL_CALL` and a context snapshot whose mode is `replay`.

Say: "The trace exports as JSON. The run snapshot says recorded trace, so a reviewer can tell this file apart from a live call."

## Shot 7 — 2:28 to 2:50 — Where the live call is

Switch to the editor, or a terminal, on `src/agent/nebius.ts` and `src/agent/constants.ts`. Show the model id and the `/chat/completions` path. If it is quick, also show the missing-key error string.

Say: "The live path is a normal Token Factory chat completion. The model id is Nemotron 3 Super. The key is `NEBIUS_API_KEY` on the server. Until that is set, Live stays off and we stay on the labeled replay."

## Shot 8 — 2:50 to 3:00 — Close

Back on the desk. Leave the Replay banner in frame.

Say: "Same three incidents, same evidence ids, once a key is in the environment. The scorecard is how we tell a live run apart from a lucky paragraph."

Stop. Do not add a montage of the protocol console unless you have time to spare under the three minutes. If you do, one sentence is enough: the Protocol console link still speaks the original WebSocket protocol.
