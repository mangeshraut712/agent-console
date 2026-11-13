# Incident Desk — Paytm demo (under 3 minutes)

Use the **Replay** source throughout this rehearsal. The local Sarvam integration
is implemented; a successful live run is still pending credits. The public
GitHub Pages site ships the same replay UI without a server-side model call.

## 0:00–0:20 — Problem and disclosure

“This is Incident Desk, an AI on-call teammate for checkout incidents. We have
integrated Sarvam for the live investigation loop. Today I’m showing the recorded
replay on seeded telemetry, clearly labelled on screen.”

## 0:20–0:40 — Open the checkout incident

Click **Checkout p99 after payments-7f3c**.

“The alert is checkout p99 at 4.2 seconds, against an 800 millisecond SLO. It starts
at the same time as a payments deployment. The operator needs a cause supported
by evidence, not just a plausible paragraph.”

## 0:40–1:25 — Plan and tools

Show the Planner, then scroll the conversation to the tool results.

“The investigation checks checkout-api and payments-db, searches their logs,
and reads the runbook. The seed shows 98 of 100 database connections in use.
The logs link that saturation to a pool-size change in payments-7f3c.”

## 1:25–1:55 — Verdict and scorecard

Show the Verdict and the six scorecard checks.

“The verdict recommends rolling the pool back to 20 and rechecking latency.
It cites evidence IDs. These six checks compare the trace with this known
fixture; they are not a production accuracy claim. Tools are read-only. An
operator decides whether to act.”

## 1:55–2:20 — Export and second scenario

Click **Export trace**. Open the saved JSON if useful. Optionally click **Login
500s from identity-gateway** and show the expired certificate evidence.

“The export includes tool calls, evidence and a run snapshot marked replay.
The login scenario also demonstrates web search. In replay that is a recorded
example; Tavily is not called.”

## 2:20–2:50 — Sarvam integration

Show slide 4, or `src/agent/sarvam.ts` and `src/agent/loop.ts`. Do not open `.env`.

“Live mode calls sarvam-105b-conversations from the server. Sarvam selects tools,
receives their results and produces the verdict. The API key stays on the server.
Provider errors stay visible and never silently switch to replay. The account’s
credit allocation is pending with the organizers.”

## 2:50–3:00 — Close

“Next, we’ll validate a live run and connect read-only telemetry, then measure
time to a correct diagnosis. UPI and settlement-specific scenarios are planned.”

## If something fails

- Network unavailable: use **Start Offline Demo.command** in the Patym folder.
- Browser unavailable: show `hackathon-kit/checkout-replay.webm` if present, or the
  screenshots under `hackathon-kit/evidence/`, explicitly labelled replay.
- Credits remain unavailable: stay in Replay. Do not repeatedly retry Live on stage.
- Short slot: demonstrate checkout only; skip the second scenario and source view.
