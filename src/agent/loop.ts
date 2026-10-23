import { NEBIUS_PROVIDER } from "./constants";
import { getIncident, unknownIncidentMessage, type Incident } from "./incidents";
import {
  InvalidNebiusBaseUrlError,
  MissingNebiusApiKeyError,
  NebiusHttpError,
  NebiusTimeoutError,
  createChatCompletion,
  resolveNebiusConfig,
  type ChatMessage,
  type Env,
  type NebiusCompletion,
  type NebiusConfig,
} from "./nebius";
import { chunkText, extractVerdict } from "./text";
import { executeTool, INCIDENT_TOOL_DEFS } from "./tools";
import type { AgentStep, InvestigationRequest } from "./types";

export interface InvestigateDeps {
  env: Env;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  maxModelCalls?: number;
}

const DEFAULT_MAX_MODEL_CALLS = 6;

export async function* runLiveInvestigation(
  request: InvestigationRequest,
  deps: InvestigateDeps,
): AsyncGenerator<AgentStep> {
  let config: NebiusConfig;
  try {
    config = resolveNebiusConfig(deps.env);
  } catch (error) {
    if (error instanceof MissingNebiusApiKeyError || error instanceof InvalidNebiusBaseUrlError) {
      yield { kind: "error", code: error.code, message: error.message };
      return;
    }
    throw error;
  }

  const incident = getIncident(request.incidentId);
  if (!incident) {
    yield { kind: "error", code: "UNKNOWN_INCIDENT", message: unknownIncidentMessage() };
    return;
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const maxCalls = deps.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(incident) },
    { role: "user", content: request.alert || incident.alert },
  ];
  const usage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 };
  const toolNames: string[] = [];

  yield {
    kind: "context",
    contextId: "incident",
    data: {
      incident_id: incident.id,
      title: incident.title,
      severity: incident.severity,
      opened_at: incident.openedAt,
      alert: incident.alert,
      services: incident.services,
      telemetry: "northwind-seed",
      mode: "live",
      model: config.model,
      base_url: config.baseUrl,
      provider: NEBIUS_PROVIDER,
    },
  };

  for (let call = 1; call <= maxCalls; call += 1) {
    let completion: NebiusCompletion;
    try {
      completion = await createChatCompletion(
        config,
        {
          messages,
          tools: INCIDENT_TOOL_DEFS,
          toolChoice: "auto",
          temperature: 0.2,
          maxTokens: 4096,
          signal: deps.signal,
        },
        fetchImpl,
      );
    } catch (error) {
      yield modelError(error);
      yield runSnapshot(incident.id, config, usage, toolNames);
      return;
    }

    usage.promptTokens += completion.usage.promptTokens;
    usage.completionTokens += completion.usage.completionTokens;
    usage.reasoningTokens += completion.usage.reasoningTokens;

    yield {
      kind: "context",
      contextId: "planner",
      data: {
        mode: "live",
        source: "nebius-token-factory",
        provider: NEBIUS_PROVIDER,
        model: completion.model || config.model,
        base_url: config.baseUrl,
        step: call,
        finish_reason: completion.finishReason,
        reasoning: completion.reasoning.slice(0, 4000) || "(The model returned no reasoning text on this step.)",
      },
    };

    if (completion.toolCalls.length > 0) {
      if (completion.content.trim()) {
        for (const text of chunkText(completion.content)) {
          yield { kind: "token", text };
        }
      }
      messages.push(assistantMessage(completion));
      for (const toolCall of completion.toolCalls) {
        const result = await runTool(toolCall.name, toolCall.arguments, incident.id, deps, fetchImpl);
        toolNames.push(toolCall.name);
        yield {
          kind: "tool_call",
          toolName: toolCall.name,
          args: toolCall.arguments,
          result,
        };
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const extracted = extractVerdict(completion.content);
    const narrative = extracted.narrative || extracted.verdict?.summary || "";
    if (narrative) {
      for (const text of chunkText(narrative)) {
        yield { kind: "token", text };
      }
    }
    if (extracted.verdict) {
      yield { kind: "context", contextId: "verdict", data: { ...extracted.verdict } };
    } else if (!narrative) {
      yield {
        kind: "error",
        code: "EMPTY_MODEL_RESPONSE",
        message: "Nemotron returned no tool call and no answer.",
      };
    }
    yield runSnapshot(incident.id, config, usage, toolNames);
    return;
  }

  yield {
    kind: "error",
    code: "STEP_BUDGET",
    message: `Stopped after ${maxCalls} calls to ${config.model}.`,
  };
  yield runSnapshot(incident.id, config, usage, toolNames);
}

function systemPrompt(incident: Incident): string {
  return [
    "You are the on-call investigator for Northwind, a checkout platform.",
    "You are running as NVIDIA Nemotron through Nebius Token Factory. You plan the investigation and you decide which tools to call.",
    "The telemetry tools read a seeded incident, not a live production account. Say that when you cite numbers.",
    "Do not invent metrics, log lines, or evidence ids. Every factual claim about this incident must come from a tool result.",
    `Incident id: ${incident.id}`,
    `Opened at: ${incident.openedAt}`,
    `Services named by the alert: ${incident.services.join(", ")}`,
    "Catalog: checkout-api, payments-db, identity-gateway, order-events, edge-proxy.",
    "Use lookup_service_health, search_logs, and read_runbook before you conclude.",
    "Use web_search when the cause may sit outside Northwind, such as a vendor status page. If web_search returns an error, say so and continue with the internal evidence.",
    "When you have enough evidence, stop calling tools. Write a short narrative for the operator, then a single JSON object with keys severity (sev1|sev2|sev3), likely_cause, evidence_ids, recommended_action, confidence (high|medium|low), and summary.",
  ].join("\n");
}

function assistantMessage(completion: NebiusCompletion): ChatMessage {
  const message: ChatMessage = {
    role: "assistant",
    content: completion.content.trim() ? completion.content : null,
    tool_calls: completion.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.arguments),
      },
    })),
  };
  if (completion.reasoning) message.reasoning_content = completion.reasoning;
  return message;
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  incidentId: string,
  deps: InvestigateDeps,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  try {
    return await executeTool(name, args, {
      incidentId,
      mode: "live",
      env: deps.env,
      fetchImpl,
      signal: deps.signal,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Tool failed" };
  }
}

function modelError(error: unknown): AgentStep {
  if (error instanceof NebiusHttpError || error instanceof NebiusTimeoutError) {
    return { kind: "error", code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { kind: "error", code: "NEBIUS_REQUEST", message: error.message };
  }
  return { kind: "error", code: "NEBIUS_REQUEST", message: "Nebius Token Factory request failed." };
}

function runSnapshot(
  incidentId: string,
  config: NebiusConfig,
  usage: { promptTokens: number; completionTokens: number; reasoningTokens: number },
  toolNames: string[],
): AgentStep {
  return {
    kind: "context",
    contextId: "run",
    data: {
      mode: "live",
      source: "nebius-token-factory",
      incident_id: incidentId,
      provider: NEBIUS_PROVIDER,
      model: config.model,
      base_url: config.baseUrl,
      tool_names: toolNames,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      reasoning_tokens: usage.reasoningTokens,
    },
  };
}
