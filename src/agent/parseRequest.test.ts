import { describe, expect, test } from "vitest";
import { parseInvestigationContent, resolveMode } from "./parseRequest";

describe("parseInvestigationContent", () => {
  test("lowercases an explicit incident and mode, and drops those lines from the alert", () => {
    expect(parseInvestigationContent("incident:AUTH-5xx\nmode:LIVE\n\nLogin is failing")).toEqual({
      incidentId: "auth-5xx",
      alert: "Login is failing",
      mode: "live",
    });
  });

  test("leaves an unmapped alert unmatched and keeps an invalid mode line", () => {
    const parsed = parseInvestigationContent("mode:turbo\nThe warehouse printer jammed");
    expect(parsed.incidentId).toBeNull();
    expect(parsed.mode).toBe("auto");
    expect(parsed.alert).toContain("mode:turbo");
    expect(parsed.alert).toContain("printer jammed");
  });

  test("resolveMode treats a blank key as replay", () => {
    expect(resolveMode("auto", { NEBIUS_API_KEY: "   " })).toBe("replay");
    expect(resolveMode("live", { NEBIUS_API_KEY: "   " })).toBe("live");
    expect(resolveMode("auto", { NEBIUS_API_KEY: "k" })).toBe("live");
  });
});
