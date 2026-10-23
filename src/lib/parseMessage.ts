import type { ServerMessage, TraceEventType } from "./types";

const SERVER_TYPES = new Set<string>([
  "TOKEN",
  "TOOL_CALL",
  "TOOL_RESULT",
  "CONTEXT_SNAPSHOT",
  "PING",
  "STREAM_END",
  "ERROR",
]);

const MAX_TEXT = 100_000;
const MAX_ID = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSeq(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_ID;
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value)) return false;
  if (typeof value.type !== "string" || !SERVER_TYPES.has(value.type)) return false;
  if (!isSeq(value.seq)) return false;
  switch (value.type) {
    case "TOKEN":
      return typeof value.text === "string" && value.text.length <= MAX_TEXT && isShortString(value.stream_id);
    case "TOOL_CALL":
      return (
        isShortString(value.call_id) &&
        value.call_id.length > 0 &&
        isShortString(value.tool_name) &&
        value.tool_name.length > 0 &&
        isShortString(value.stream_id) &&
        isRecord(value.args)
      );
    case "TOOL_RESULT":
      return isShortString(value.call_id) && isShortString(value.stream_id) && isRecord(value.result);
    case "CONTEXT_SNAPSHOT":
      return isShortString(value.context_id) && value.context_id.length > 0 && isRecord(value.data);
    case "PING":
      return typeof value.challenge === "string" && value.challenge.length <= MAX_ID;
    case "STREAM_END":
      return isShortString(value.stream_id);
    case "ERROR":
      return (
        typeof value.code === "string" &&
        value.code.length > 0 &&
        value.code.length <= 100 &&
        typeof value.message === "string" &&
        value.message.length <= 4_000
      );
    default:
      return false;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isServerMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function traceTypeLabel(type: TraceEventType): string {
  return type.replace(/_/g, " ");
}
