import { describe, expect, test } from "vitest";
import { scoreInvestigation } from "./eval";
import type { Verdict } from "./types";

const PASSING: Verdict = {
  severity: "sev2",
  likely_cause: "The connection pool is saturated.",
  evidence_ids: ["ev-checkout-pool"],
  recommended_action: "Roll the checkout-api pool size back to 20 and watch p99.",
  confidence: "high",
  summary: "Checkout latency is a connection pool problem.",
};

describe("scoreInvestigation", () => {
  test("returns null for an incident outside the seed", () => {
    expect(
      scoreInvestigation({
        incidentId: "not-a-seed",
        toolNames: ["lookup_service_health"],
        services: ["checkout-api"],
        verdict: PASSING,
        narrative: "pool",
      }),
    ).toBeNull();
  });

  test("fails each check when tools, cause, evidence, action, or services are wrong", () => {
    const report = scoreInvestigation({
      incidentId: "checkout-latency",
      toolNames: [],
      services: ["billing-api"],
      verdict: {
        ...PASSING,
        likely_cause: "mystery",
        summary: "unknown",
        evidence_ids: [],
        recommended_action: "wait",
      },
      narrative: "nothing useful",
    });
    expect(report?.total).toBe(6);
    expect(report?.passed).toBe(0);
    expect(report?.checks.map((check) => check.id)).toEqual([
      "required_tools",
      "cause",
      "evidence",
      "action",
      "known_services",
      "step_budget",
    ]);
    expect(report?.checks.find((check) => check.id === "known_services")?.detail).toContain("billing-api");
    expect(report?.checks.find((check) => check.id === "required_tools")?.detail).toContain("lookup_service_health");
  });

  test("rejects a tool list that runs past the step budget", () => {
    const report = scoreInvestigation({
      incidentId: "checkout-latency",
      toolNames: Array.from({ length: 9 }, () => "lookup_service_health"),
      services: ["checkout-api"],
      verdict: PASSING,
      narrative: "pool ev-checkout-pool",
    });
    expect(report?.checks.find((check) => check.id === "step_budget")?.pass).toBe(false);
    expect(report?.checks.find((check) => check.id === "required_tools")?.pass).toBe(false);
    expect(report?.checks.find((check) => check.id === "cause")?.pass).toBe(true);
  });
});
