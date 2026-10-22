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
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const candidate = fenced?.[1]?.trim() || findLastJsonObject(content);
  if (!candidate) return { narrative: content.trim(), verdict: null };
  try {
    const verdict = coerceVerdict(JSON.parse(candidate) as unknown);
    if (!verdict) return { narrative: content.trim(), verdict: null };
    const narrative = (fenced ? content.replace(fenced[0], "") : content.replace(candidate, "")).trim();
    return { narrative, verdict };
  } catch {
    return { narrative: content.trim(), verdict: null };
  }
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

function findLastJsonObject(content: string): string | null {
  const start = content.lastIndexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return content.slice(start, end + 1);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
