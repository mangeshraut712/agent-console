import { describe, expect, test } from "vitest";
import { chunkText, coerceVerdict, extractVerdict } from "./text";
import type { Verdict } from "./types";

const VERDICT: Verdict = {
  severity: "sev1",
  likely_cause: "The upstream certificate expired.",
  evidence_ids: ["ev-idp-cert"],
  recommended_action: "Trust the new Harbor ID chain and retry token requests.",
  confidence: "high",
  summary: "Login 500s are an expired upstream certificate.",
};

describe("verdict text", () => {
  test("chunkText keeps the full text and splits long input", () => {
    expect(chunkText("short note")).toEqual(["short note"]);
    expect(chunkText("")).toEqual([]);
    const source = "alpha beta gamma delta epsilon zeta eta theta iota";
    const chunks = chunkText(source, 16);
    expect(chunks.join("")).toBe(source);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("extracts a fenced verdict and a trailing JSON object", () => {
    const fenced = extractVerdict(`The certificate expired.\n\`\`\`json\n${JSON.stringify(VERDICT)}\n\`\`\``);
    expect(fenced.verdict).toEqual(VERDICT);
    expect(fenced.narrative).toBe("The certificate expired.");

    const bare = extractVerdict(`Operator note ${JSON.stringify({ ...VERDICT, evidence_ids: ["ev-idp-cert", " ", 3] })}`);
    expect(bare.verdict?.evidence_ids).toEqual(["ev-idp-cert"]);
    expect(bare.narrative).toContain("Operator note");
  });

  test("keeps the narrative when the verdict is missing, invalid, or incomplete", () => {
    expect(extractVerdict("No JSON here.").verdict).toBeNull();
    expect(extractVerdict("prefix {not json}").verdict).toBeNull();
    expect(extractVerdict("prefix {not json}").narrative).toBe("prefix {not json}");

    const incomplete = extractVerdict(JSON.stringify({ ...VERDICT, severity: "sev9", summary: "" }));
    expect(incomplete.verdict).toBeNull();
    expect(coerceVerdict(null)).toBeNull();
    expect(coerceVerdict([])).toBeNull();
    expect(coerceVerdict({ ...VERDICT, confidence: "certain" })).toBeNull();
    expect(coerceVerdict({ ...VERDICT, recommended_action: "   " })).toBeNull();
  });
});
