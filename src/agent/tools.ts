import {
  isToolName,
  lookupServiceHealth,
  readRunbook,
  searchLogs,
  seededWebSearch,
  type ToolName,
} from "./incidents";
import type { Env } from "./nebius";
import type { FunctionTool } from "./nebius";
import type { InvestigationMode } from "./types";
import { tavilySearch } from "./tavily";

export interface ToolContext {
  incidentId: string;
  mode: InvestigationMode;
  env: Env;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

export const INCIDENT_TOOL_DEFS: FunctionTool[] = [
  {
    type: "function",
    function: {
      name: "lookup_service_health",
      description: "Read health, latency, and error rate for one Northwind service in the seeded incident.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          service: {
            type: "string",
            description: "Service id: checkout-api, payments-db, identity-gateway, order-events, or edge-proxy.",
          },
        },
        required: ["service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_logs",
      description: "Search recent logs for one service. Returns matching lines and evidence ids from the seed.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          service: { type: "string" },
          query: {
            type: "string",
            description: "Substring to match, such as pool, certificate, or schema.",
          },
        },
        required: ["service", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_runbook",
      description: "Read the on-call runbook section for a symptom.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          symptom: {
            type: "string",
            description: "Short symptom, such as checkout latency, auth 5xx, or queue lag.",
          },
        },
        required: ["symptom"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the public web with Tavily for vendor status or docs that the Northwind seed does not contain. In replay mode this returns a recorded example and does not call Tavily.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  if (!isToolName(name)) {
    return { error: "Unknown tool", tool: name };
  }
  return dispatchTool(name, args, ctx);
}

async function dispatchTool(
  name: ToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "lookup_service_health":
      return lookupServiceHealth(args.service, ctx.incidentId);
    case "search_logs":
      return searchLogs(args.service, args.query, ctx.incidentId);
    case "read_runbook":
      return readRunbook(args.symptom);
    case "web_search":
      return searchWeb(args, ctx);
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

const MAX_WEB_QUERY_CHARS = 400;

async function searchWeb(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { error: "query is required" };
  if (query.length > MAX_WEB_QUERY_CHARS) {
    return { error: "query is too long", query: query.slice(0, 80) };
  }
  if (ctx.mode === "replay") return seededWebSearch(ctx.incidentId, query);
  return tavilySearch(query, ctx.env, ctx.fetchImpl, ctx.signal);
}
