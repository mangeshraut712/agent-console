import { DEFAULT_NEBIUS_BASE_URL, DEFAULT_NEMOTRON_MODEL, NEBIUS_PROVIDER, REPLAY_DISCLAIMER } from "./constants";
import { getIncident, unknownIncidentMessage, type Incident } from "./incidents";
import { chunkText } from "./text";
import { executeTool } from "./tools";
import type { AgentStep, InvestigationRequest, Verdict } from "./types";
import type { InvestigateDeps } from "./loop";

interface PlanEvent {
  kind: "plan";
  reasoning: string;
}

interface ToolEvent {
  kind: "tool";
  name: string;
  args: Record<string, unknown>;
}

interface NarrativeEvent {
  kind: "narrative";
  text: string;
}

interface VerdictEvent {
  kind: "verdict";
  verdict: Verdict;
}

type ReplayEvent = PlanEvent | ToolEvent | NarrativeEvent | VerdictEvent;

const REPLAYS: Record<string, ReplayEvent[]> = {
  "checkout-latency": [
    {
      kind: "plan",
      reasoning:
        "The alert names checkout-api and deploy payments-7f3c at 14:06 UTC. I will read checkout-api and payments-db health before touching logs, because a latency page can be a dependency problem.",
    },
    {
      kind: "tool",
      name: "lookup_service_health",
      args: { service: "checkout-api" },
    },
    {
      kind: "tool",
      name: "lookup_service_health",
      args: { service: "payments-db" },
    },
    {
      kind: "plan",
      reasoning:
        "checkout-api p99 is 4200ms and payments-db is at 98 of 100 connections. Next I will search both services for pool and connection errors, then read the checkout latency runbook.",
    },
    {
      kind: "tool",
      name: "search_logs",
      args: { service: "checkout-api", query: "pool" },
    },
    {
      kind: "tool",
      name: "search_logs",
      args: { service: "payments-db", query: "connection" },
    },
    {
      kind: "tool",
      name: "read_runbook",
      args: { symptom: "checkout latency" },
    },
    {
      kind: "narrative",
      text: "Checkout p99 moved to 4.2s at 14:06 UTC, the same minute as deploy payments-7f3c. checkout-api is waiting on payments-db: the pool is 98 of 100 in use. Log ev-checkout-pool is a timeout acquiring a connection, and the deploy log shows pool_size changed from 20 to 100 while payments-db max_connections stayed at 100. The runbook says to roll that pool back before adding API replicas. I would set the pool back to 20 and watch checkout p99.",
    },
    {
      kind: "verdict",
      verdict: {
        severity: "sev2",
        likely_cause:
          "payments-7f3c raised the checkout-api connection pool to 100, saturating payments-db max_connections.",
        evidence_ids: ["ev-checkout-pool", "ev-payments-db-saturation"],
        recommended_action:
          "Roll the checkout-api pool size back to 20, confirm payments-db connections fall, then re-check checkout p99.",
        confidence: "high",
        summary:
          "Checkout latency is connection pool saturation caused by deploy payments-7f3c.",
      },
    },
  ],
  "auth-5xx": [
    {
      kind: "plan",
      reasoning:
        "Logins fail at identity-gateway while the alert says edge-proxy is healthy. I will confirm both health snapshots, then search gateway logs for the 500.",
    },
    {
      kind: "tool",
      name: "lookup_service_health",
      args: { service: "identity-gateway" },
    },
    {
      kind: "tool",
      name: "lookup_service_health",
      args: { service: "edge-proxy" },
    },
    {
      kind: "plan",
      reasoning:
        "The gateway error rate is 18% and the proxy is quiet. I will search for certificate or TLS errors, read the auth runbook, and check the public status page because the upstream is an external IdP.",
    },
    {
      kind: "tool",
      name: "search_logs",
      args: { service: "identity-gateway", query: "certificate" },
    },
    {
      kind: "tool",
      name: "read_runbook",
      args: { symptom: "auth 5xx" },
    },
    {
      kind: "tool",
      name: "web_search",
      args: { query: "Harbor ID certificate rotation status" },
    },
    {
      kind: "narrative",
      text: "identity-gateway started returning 500 on /oauth/token at 00:10 UTC. edge-proxy is healthy, so this is not an edge outage. Log ev-idp-cert says the Harbor ID upstream certificate expired at 2026-10-21 00:00 UTC. The runbook says to confirm the vendor status page before trusting a new chain, and not to fail open. The recorded status note ev-vendor-status says Harbor ID rotated that certificate and customers should trust the new chain. I would install the new chain and retry token requests.",
    },
    {
      kind: "verdict",
      verdict: {
        severity: "sev1",
        likely_cause: "The Harbor ID upstream certificate expired, so identity-gateway cannot complete TLS.",
        evidence_ids: ["ev-idp-cert", "ev-vendor-status"],
        recommended_action:
          "Trust the new Harbor ID chain on identity-gateway and retry /oauth/token. Do not fail open.",
        confidence: "high",
        summary: "Login 500s are an expired upstream certificate, confirmed by the gateway log and the vendor status note.",
      },
    },
  ],
  "queue-lag": [
    {
      kind: "plan",
      reasoning:
        "Lag is high but the alert says the consumer process is up and checkout still accepts orders. I will check order-events and checkout-api health before assuming we need more consumers.",
    },
    {
      kind: "tool",
      name: "lookup_service_health",
      args: { service: "order-events" },
    },
    {
      kind: "tool",
      name: "lookup_service_health",
      args: { service: "checkout-api" },
    },
    {
      kind: "plan",
      reasoning:
        "The consumer is up and checkout is healthy. A stuck partition is more likely than a capacity problem. I will search for poison or schema errors and read the lag runbook.",
    },
    {
      kind: "tool",
      name: "search_logs",
      args: { service: "order-events", query: "poison" },
    },
    {
      kind: "tool",
      name: "search_logs",
      args: { service: "order-events", query: "schema" },
    },
    {
      kind: "tool",
      name: "read_runbook",
      args: { symptom: "queue lag" },
    },
    {
      kind: "narrative",
      text: "order-events lag is 84012 and the process is still up. checkout-api is healthy, so the backlog is asynchronous. Log ev-poison-message rejected a message with unknown field promo_code_v2 and sent it to the DLQ at partition 3. ev-schema-mismatch says processing stopped on that partition. The runbook says to inspect the DLQ before scaling consumers. I would quarantine that message and confirm lag on partition 3 starts falling.",
    },
    {
      kind: "verdict",
      verdict: {
        severity: "sev2",
        likely_cause:
          "A poison message with unknown field promo_code_v2 pinned order-events partition 3 after a schema change.",
        evidence_ids: ["ev-poison-message", "ev-schema-mismatch"],
        recommended_action:
          "Quarantine the DLQ message on partition 3, then confirm consumer lag falls. Do not add consumers first.",
        confidence: "high",
        summary: "Queue lag is a poison message and schema mismatch, not a lack of consumer capacity.",
      },
    },
  ],
};

export async function* runReplay(
  request: InvestigationRequest,
  deps: Pick<InvestigateDeps, "fetchImpl"> = {},
): AsyncGenerator<AgentStep> {
  const incident = getIncident(request.incidentId);
  if (!incident) {
    yield { kind: "error", code: "UNKNOWN_INCIDENT", message: unknownIncidentMessage() };
    return;
  }
  const script = REPLAYS[incident.id];
  if (!script) {
    yield { kind: "error", code: "UNKNOWN_INCIDENT", message: unknownIncidentMessage() };
    return;
  }

  const toolNames: string[] = [];
  let planStep = 0;
  yield { kind: "context", contextId: "incident", data: incidentContext(incident) };

  for (const event of script) {
    switch (event.kind) {
      case "plan":
        planStep += 1;
        yield {
          kind: "context",
          contextId: "planner",
          data: {
            mode: "replay",
            source: "recorded-trace",
            step: planStep,
            reasoning: event.reasoning,
            disclaimer: REPLAY_DISCLAIMER,
            live_model: DEFAULT_NEMOTRON_MODEL,
            provider: NEBIUS_PROVIDER,
          },
        };
        break;
      case "tool": {
        const result = await executeTool(event.name, event.args, {
          incidentId: incident.id,
          mode: "replay",
          env: {},
          fetchImpl: deps.fetchImpl ?? fetch,
        });
        toolNames.push(event.name);
        yield { kind: "tool_call", toolName: event.name, args: event.args, result };
        break;
      }
      case "narrative":
        for (const text of chunkText(event.text)) {
          yield { kind: "token", text };
        }
        break;
      case "verdict":
        yield { kind: "context", contextId: "verdict", data: { ...event.verdict } };
        break;
      default: {
        const _exhaustive: never = event;
        throw new Error(`Unhandled replay event: ${String(_exhaustive)}`);
      }
    }
  }

  yield {
    kind: "context",
    contextId: "run",
    data: {
      mode: "replay",
      source: "recorded-trace",
      incident_id: incident.id,
      provider: NEBIUS_PROVIDER,
      live_model: DEFAULT_NEMOTRON_MODEL,
      live_base_url: DEFAULT_NEBIUS_BASE_URL,
      disclaimer: REPLAY_DISCLAIMER,
      tool_names: toolNames,
      prompt_tokens: null,
      completion_tokens: null,
      reasoning_tokens: null,
    },
  };
}

function incidentContext(incident: Incident): Record<string, unknown> {
  return {
    incident_id: incident.id,
    title: incident.title,
    severity: incident.severity,
    opened_at: incident.openedAt,
    alert: incident.alert,
    services: incident.services,
    telemetry: "northwind-seed",
    mode: "replay",
    disclaimer: REPLAY_DISCLAIMER,
  };
}
