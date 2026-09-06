import type { ServerMessage } from "./types";

export type DemoScriptEvent =
  | { kind: "token"; text: string }
  | { kind: "context"; context_id: string; data: Record<string, unknown> }
  | {
      kind: "tool_call";
      tool_name: string;
      args: Record<string, unknown>;
      result: Record<string, unknown>;
    };

export interface DemoScript {
  id: string;
  name: string;
  triggers: string[];
  events: DemoScriptEvent[];
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: "greeting",
    name: "Simple Greeting",
    triggers: ["hello", "hi", "hey", "greetings", "good morning", "good evening"],
    events: [
      {
        kind: "context",
        context_id: "ctx_session",
        data: {
          session_type: "conversational",
          capabilities: ["search", "analyze", "compute", "summarize"],
          mode: "in-browser demo",
        },
      },
      { kind: "token", text: "Hello! " },
      { kind: "token", text: "This is the " },
      { kind: "token", text: "Agent Console demo. " },
      { kind: "token", text: "The GitHub Pages build " },
      { kind: "token", text: "runs an in-browser mock agent " },
      { kind: "token", text: "so you can explore streaming, " },
      { kind: "token", text: "tool calls, and the trace " },
      { kind: "token", text: "timeline without a backend. " },
      { kind: "token", text: "Try the chips above, or " },
      { kind: "token", text: "point the URL at your own " },
      { kind: "token", text: "ws:// server locally." },
    ],
  },
  {
    id: "report_summary",
    name: "Report Summary",
    triggers: ["report", "summary", "summarize", "quarterly", "q3", "q4", "earnings"],
    events: [
      {
        kind: "context",
        context_id: "ctx_report",
        data: {
          report: "Q3-2025-Financial",
          pages: 47,
          sections: ["revenue", "operations", "forecast", "risks"],
          last_updated: "2025-10-15T09:30:00Z",
        },
      },
      { kind: "token", text: "Based on the Q3 financial report, " },
      { kind: "token", text: "performance shows strong growth. " },
      { kind: "token", text: "Revenue grew " },
      {
        kind: "tool_call",
        tool_name: "lookup_metric",
        args: { metric: "revenue_yoy", quarter: "Q3-2025" },
        result: { value: "23.4%", period: "YoY", raw_amount: 4250000, currency: "USD" },
      },
      { kind: "token", text: "23.4% year-over-year, reaching $4.25M. " },
      { kind: "token", text: "Operating margins improved to 34% from 28% in Q2." },
    ],
  },
  {
    id: "multi_tool",
    name: "Multi-Tool Analysis",
    triggers: ["analyze", "compare", "correlation", "analysis", "relationship"],
    events: [
      {
        kind: "context",
        context_id: "ctx_analysis",
        data: {
          analysis_type: "correlation",
          datasets: ["user_growth", "revenue", "churn"],
          timeframe: "2024-01 to 2025-09",
        },
      },
      { kind: "token", text: "Let me analyze the relationship between your key metrics. " },
      {
        kind: "tool_call",
        tool_name: "fetch_dataset",
        args: { dataset: "user_growth", timeframe: "2024-01:2025-09" },
        result: { total_records: 2847, growth_rate: 0.12, trend: "accelerating" },
      },
      { kind: "token", text: "User growth shows 2,847 new accounts at 12% monthly. " },
      {
        kind: "tool_call",
        tool_name: "compute_correlation",
        args: { metrics: ["user_growth", "revenue"], method: "pearson" },
        result: { correlation: 0.87, p_value: 0.001, lag_months: 2 },
      },
      { kind: "token", text: "Pearson correlation with revenue is 0.87 with a 2-month lag." },
    ],
  },
  {
    id: "lookup",
    name: "Knowledge Base Lookup",
    triggers: ["look up", "lookup", "find", "search", "what is", "define"],
    events: [
      {
        kind: "tool_call",
        tool_name: "search_knowledge_base",
        args: { query: "deployment SLA requirements", top_k: 3 },
        result: {
          found: true,
          document: "SLA-Framework-v3",
          section: "4.2",
          relevance_score: 0.94,
        },
      },
      {
        kind: "context",
        context_id: "ctx_search",
        data: { source_document: "SLA-Framework-v3", section: "4.2", confidence: 0.94 },
      },
      { kind: "token", text: "Production deployments require 99.95% uptime " },
      { kind: "token", text: "with P0 acknowledgment within 5 minutes." },
    ],
  },
  {
    id: "large_context",
    name: "Large Context Load",
    triggers: ["schema", "database", "large", "context", "full"],
    events: [
      {
        kind: "context",
        context_id: "ctx_schema",
        data: {
          schema_version: "4.7.2",
          database: "demo_production",
          total_tables: 64,
          domains: ["user_management", "billing", "analytics", "agent_ops"],
          flagged_issues: ["orphan_tables", "missing_indices"],
        },
      },
      { kind: "token", text: "I've loaded the database schema into context. " },
      {
        kind: "tool_call",
        tool_name: "analyze_schema",
        args: { focus: "relationships", depth: "full" },
        result: {
          total_tables: 64,
          foreign_keys: 67,
          most_connected: "events",
          orphan_tables: ["legacy_logs", "temp_migrations"],
        },
      },
      { kind: "token", text: "The most connected table is `events`. " },
      { kind: "token", text: "Orphan tables: `legacy_logs` and `temp_migrations`." },
    ],
  },
  {
    id: "long_response",
    name: "Long Detailed Response",
    triggers: ["long", "detailed", "document", "write", "explain in detail", "comprehensive"],
    events: [
      {
        kind: "context",
        context_id: "ctx_doc",
        data: { document_type: "technical_brief", topic: "context_engine_architecture" },
      },
      { kind: "token", text: "The context engine is built around verifiable retrieval, " },
      { kind: "token", text: "persistent memory, and sub-200ms p99 latency. " },
      {
        kind: "tool_call",
        tool_name: "fetch_architecture_diagram",
        args: { component: "context_engine", format: "summary" },
        result: {
          layers: ["ingestion", "indexing", "retrieval", "caching"],
          p99_latency_ms: 187,
        },
      },
      { kind: "token", text: "Four layers — ingestion, indexing, retrieval, caching — " },
      { kind: "token", text: "currently sit at 187ms p99." },
    ],
  },
  {
    id: "default",
    name: "Default Response",
    triggers: [],
    events: [
      {
        kind: "context",
        context_id: "ctx_session",
        data: {
          session_type: "general",
          capabilities: ["search", "analyze", "compute", "summarize"],
          mode: "in-browser demo",
        },
      },
      { kind: "token", text: "I've reviewed your request. " },
      {
        kind: "tool_call",
        tool_name: "classify_intent",
        args: { text: "user_query", confidence_threshold: 0.7 },
        result: { intent: "general_query", confidence: 0.82 },
      },
      { kind: "token", text: "This is an information-retrieval query. " },
      { kind: "token", text: "Try a quick prompt, or connect a real agent over WebSocket." },
    ],
  },
];

export function selectDemoScript(userMessage: string): DemoScript {
  const lower = userMessage.toLowerCase();

  for (const script of DEMO_SCRIPTS) {
    if (script.triggers.length === 0) continue;
    for (const trigger of script.triggers) {
      if (lower.includes(trigger)) {
        return script;
      }
    }
  }

  const defaultScript = DEMO_SCRIPTS.find((s) => s.id === "default");
  if (!defaultScript) {
    throw new Error("No default demo script found");
  }
  return defaultScript;
}

export function toServerMessages(
  script: DemoScript,
  streamId: string,
  startSeq = 1,
): { messages: ServerMessage[]; nextSeq: number } {
  const messages: ServerMessage[] = [];
  let seq = startSeq;
  let callOrdinal = 0;

  for (const event of script.events) {
    switch (event.kind) {
      case "token":
        messages.push({ type: "TOKEN", seq: seq++, text: event.text, stream_id: streamId });
        break;
      case "context":
        messages.push({
          type: "CONTEXT_SNAPSHOT",
          seq: seq++,
          context_id: event.context_id,
          data: event.data,
        });
        break;
      case "tool_call": {
        const callId = `demo_tc_${callOrdinal++}`;
        messages.push({
          type: "TOOL_CALL",
          seq: seq++,
          call_id: callId,
          tool_name: event.tool_name,
          args: event.args,
          stream_id: streamId,
        });
        messages.push({
          type: "TOOL_RESULT",
          seq: seq++,
          call_id: callId,
          result: event.result,
          stream_id: streamId,
        });
        break;
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  }

  messages.push({ type: "STREAM_END", seq: seq++, stream_id: streamId });
  return { messages, nextSeq: seq };
}
