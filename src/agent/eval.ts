import { getIncident, KNOWN_SERVICES } from "./incidents";
import type { EvalCheck, EvalReport, Verdict } from "./types";

export interface EvalObservation {
  incidentId: string;
  toolNames: string[];
  services: string[];
  verdict: Partial<Verdict> | null;
  narrative: string;
}

export function scoreInvestigation(observation: EvalObservation): EvalReport | null {
  const incident = getIncident(observation.incidentId);
  if (!incident) return null;

  const narrative = observation.narrative.toLowerCase();
  const causeText = [
    observation.verdict?.likely_cause ?? "",
    observation.verdict?.summary ?? "",
    observation.narrative,
  ]
    .join(" ")
    .toLowerCase();
  const cited = new Set(
    (observation.verdict?.evidence_ids ?? []).map((id) => id.toLowerCase()),
  );
  const mentionedEvidence = incident.evidenceIds.filter(
    (id) => cited.has(id.toLowerCase()) || narrative.includes(id.toLowerCase()),
  );
  const toolSet = new Set(observation.toolNames);
  const missingTools = incident.requiredTools.filter((name) => !toolSet.has(name));
  const unknownServices = observation.services.filter(
    (service) => !(KNOWN_SERVICES as readonly string[]).includes(service),
  );
  const action = observation.verdict?.recommended_action?.trim() ?? "";
  const matchedKeyword = incident.causeKeywords.find((keyword) => causeText.includes(keyword));

  const checks: EvalCheck[] = [
    {
      id: "required_tools",
      title: "Required tools",
      pass: missingTools.length === 0,
      detail:
        missingTools.length === 0
          ? `Called ${incident.requiredTools.join(", ")}.`
          : `Missing ${missingTools.join(", ")}.`,
    },
    {
      id: "cause",
      title: "Cause matches the seed",
      pass: Boolean(matchedKeyword),
      detail: matchedKeyword
        ? `Found “${matchedKeyword}” in the verdict or narrative.`
        : `Expected one of: ${incident.causeKeywords.join(", ")}.`,
    },
    {
      id: "evidence",
      title: "Cites seeded evidence",
      pass: mentionedEvidence.length > 0,
      detail:
        mentionedEvidence.length > 0
          ? `Cited ${mentionedEvidence.join(", ")}.`
          : `Expected one of: ${incident.evidenceIds.join(", ")}.`,
    },
    {
      id: "action",
      title: "Recommends an action",
      pass: action.length > 10,
      detail: action.length > 10 ? action : "recommended_action is missing.",
    },
    {
      id: "known_services",
      title: "Services stay in the catalog",
      pass: unknownServices.length === 0,
      detail:
        unknownServices.length === 0
          ? "Every service argument is in the Northwind catalog."
          : `Unknown services: ${unknownServices.join(", ")}.`,
    },
    {
      id: "step_budget",
      title: "Tool count stays bounded",
      pass: observation.toolNames.length >= 1 && observation.toolNames.length <= 8,
      detail: `${observation.toolNames.length} tool call${observation.toolNames.length === 1 ? "" : "s"}.`,
    },
  ];

  return {
    incidentId: incident.id,
    checks,
    passed: checks.filter((check) => check.pass).length,
    total: checks.length,
  };
}
