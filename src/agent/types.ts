export type InvestigationMode = "live" | "replay";

export type RequestedMode = InvestigationMode | "auto";

export interface InvestigationRequest {
  incidentId: string | null;
  alert: string;
  mode: InvestigationMode;
}

export interface Verdict {
  severity: "sev1" | "sev2" | "sev3";
  likely_cause: string;
  evidence_ids: string[];
  recommended_action: string;
  confidence: "high" | "medium" | "low";
  summary: string;
}

export type AgentStep =
  | { kind: "context"; contextId: string; data: Record<string, unknown> }
  | { kind: "token"; text: string }
  | {
      kind: "tool_call";
      toolName: string;
      args: Record<string, unknown>;
      result: Record<string, unknown>;
    }
  | { kind: "error"; code: string; message: string };

export interface EvalCheck {
  id: string;
  title: string;
  pass: boolean;
  detail: string;
}

export interface EvalReport {
  incidentId: string;
  checks: EvalCheck[];
  passed: number;
  total: number;
}
