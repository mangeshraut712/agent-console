import type { Verdict } from "./types";

const SEVERITIES = new Set(["sev1", "sev2", "sev3"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

export function chunkText(text: string, size = 72): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= size) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(" ", size);
    if (cut < 16) cut = size;
    parts.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  return parts.filter((part) => part.length > 0);
}

export function extractVerdict(content: string): { narrative: string; verdict: Verdict | null } {
  const fences = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let index = fences.length - 1; index >= 0; index -= 1) {
    const fence = fences[index]!;
    const verdict = verdictFromText((fence[1] ?? "").trim());
    if (!verdict) continue;
    const start = fence.index ?? 0;
    const narrative = `${content.slice(0, start)}${content.slice(start + fence[0].length)}`.trim();
    return { narrative, verdict };
  }

  const objects = topLevelJsonObjects(content);
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const span = objects[index]!;
    const verdict = verdictFromText(span.text);
    if (!verdict) continue;
    const narrative = `${content.slice(0, span.start)}${content.slice(span.end)}`.trim();
    return { narrative, verdict };
  }

  return { narrative: content.trim(), verdict: null };
}

export function coerceVerdict(value: unknown): Verdict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const severity = typeof row.severity === "string" ? row.severity.toLowerCase() : "";
  const confidence = typeof row.confidence === "string" ? row.confidence.toLowerCase() : "";
  const likely = stringField(row.likely_cause);
  const action = stringField(row.recommended_action);
  const summary = stringField(row.summary);
  if (!SEVERITIES.has(severity) || !CONFIDENCE.has(confidence) || !likely || !action || !summary) {
    return null;
  }
  const evidence = Array.isArray(row.evidence_ids)
    ? row.evidence_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  return {
    severity: severity as Verdict["severity"],
    likely_cause: likely,
    evidence_ids: evidence,
    recommended_action: action,
    confidence: confidence as Verdict["confidence"],
    summary,
  };
}

function verdictFromText(text: string): Verdict | null {
  try {
    return coerceVerdict(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

interface JsonSpan {
  start: number;
  end: number;
  text: string;
}

/** Balanced top-level `{...}` spans, ignoring braces that sit inside strings. */
function topLevelJsonObjects(content: string): JsonSpan[] {
  const spans: JsonSpan[] = [];
  let inString = false;
  let escape = false;
  const starts: number[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const ch = content[index]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      starts.push(index);
      continue;
    }
    if (ch === "}" && starts.length > 0) {
      const start = starts.pop()!;
      if (starts.length === 0) {
        spans.push({ start, end: index + 1, text: content.slice(start, index + 1) });
      }
    }
  }
  return spans;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
