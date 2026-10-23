import { matchIncidentId } from "./incidents";
import type { Env } from "./nebius";
import type { InvestigationRequest, RequestedMode } from "./types";

export interface ParsedInvestigation {
  incidentId: string | null;
  alert: string;
  mode: RequestedMode;
}

export function parseInvestigationContent(content: string): ParsedInvestigation {
  let incidentId: string | null = null;
  let mode: RequestedMode = "auto";
  const alertLines: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const incident = /^incident:\s*([a-z0-9-]+)\s*$/i.exec(trimmed);
    const requested = /^mode:\s*(auto|live|replay)\s*$/i.exec(trimmed);
    if (incident?.[1]) {
      incidentId = incident[1].toLowerCase();
      continue;
    }
    if (requested?.[1]) {
      mode = requested[1].toLowerCase() as RequestedMode;
      continue;
    }
    alertLines.push(line);
  }

  const alert = alertLines.join("\n").trim() || content.trim();
  if (!incidentId) incidentId = matchIncidentId(alert);
  return { incidentId, alert, mode };
}

export function resolveMode(mode: RequestedMode, env: Env): InvestigationRequest["mode"] {
  if (mode === "live") return "live";
  if (mode === "replay") return "replay";
  return env.NEBIUS_API_KEY?.trim() ? "live" : "replay";
}
