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

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.type !== "string" || !SERVER_TYPES.has(msg.type)) return false;
  if (typeof msg.seq !== "number" || !Number.isFinite(msg.seq)) return false;
  return true;
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
