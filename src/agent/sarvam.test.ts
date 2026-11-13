import { afterEach, describe, expect, test, vi } from "vitest";
import { runInvestigation } from "./investigate";
import { resolveMode } from "./parseRequest";
import { GET } from "../app/api/health/route";
import type { AgentStep } from "./types";

const key = "test-sarvam-key-not-a-real-credential";
async function collect(gen: AsyncGenerator<AgentStep>) {
  const steps: AgentStep[] = [];
  for await (const step of gen) steps.push(step);
  return steps;
}
const request = { incidentId: "checkout-latency", alert: "Checkout is slow", mode: "live" as const };
const reply = (message: object) => new Response(JSON.stringify({
  model: "sarvam-105b-conversations",
  choices: [{ message, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 8 },
}));
afterEach(() => vi.unstubAllEnvs());

describe("Sarvam investigation integration", () => {
  test("uses Sarvam tool calls and feeds actual seeded evidence back before the verdict", async () => {
    const bodies: Record<string, any>[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://api.sarvam.ai/v1/chat/completions");
      expect(new Headers(init?.headers).get("api-subscription-key")).toBe(key);
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      expect(body.model).toBe("sarvam-105b-conversations");
      expect(body.reasoning_effort).toBe("low");
      expect(body.tools.map((t: any) => t.function.name)).toContain("search_logs");
      if (bodies.length === 1) return reply({ content: null, tool_calls: [{
        id: "call_logs", type: "function",
        function: { name: "search_logs", arguments: JSON.stringify({ service: "checkout-api", query: "pool" }) },
      }] });
      expect(body.messages.at(-1).role).toBe("tool");
      expect(body.messages.at(-1).tool_call_id).toBe("call_logs");
      expect(body.messages.at(-1).content).toContain("pool");
      return reply({ content: JSON.stringify({ severity: "sev2", likely_cause: "Connection pool saturation",
        evidence_ids: ["ev-checkout-pool"], recommended_action: "Review rollback with the operator",
        confidence: "high", summary: "Seeded checkout logs show pool saturation." }) });
    };
    const steps = await collect(runInvestigation(request, { env: { SARVAM_API_KEY: key }, fetchImpl }));
    expect(bodies).toHaveLength(2);
    expect(steps.some(s => s.kind === "tool_call" && s.toolName === "search_logs")).toBe(true);
    expect(steps.find(s => s.kind === "context" && s.contextId === "run")).toMatchObject({
      data: { provider: "Sarvam AI", source: "sarvam", model: "sarvam-105b-conversations", prompt_tokens: 24 },
    });
    expect(steps.some(s => s.kind === "context" && s.contextId === "verdict")).toBe(true);
    expect(JSON.stringify(steps)).not.toContain(key);
  });

  test("402 is a credit error, never a replay or another provider, and never leaks an upstream body", async () => {
    let calls = 0;
    const steps = await collect(runInvestigation(request, {
      env: { SARVAM_API_KEY: key, NEBIUS_API_KEY: "other-provider-key" },
      fetchImpl: async () => { calls++; return new Response(`No credits: ${key}`, { status: 402 }); },
    }));
    expect(calls).toBe(1);
    expect(steps.find(s => s.kind === "error")).toMatchObject({ kind: "error", code: "SARVAM_CREDITS" });
    expect(JSON.stringify(steps)).not.toContain(key);
    expect(steps.some(s => s.kind === "context" && s.data.mode === "replay")).toBe(false);
    expect(steps.some(s => s.kind === "context" && s.contextId === "verdict")).toBe(false);
  });

  test("explicit Sarvam selection without a key fails before network access", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const steps = await collect(runInvestigation(request, {
      env: { INCIDENT_PROVIDER: "sarvam", NEBIUS_API_KEY: "other" }, fetchImpl,
    }));
    expect(steps[0]).toMatchObject({ kind: "error", code: "MISSING_SARVAM_API_KEY" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolveMode("auto", { SARVAM_API_KEY: key })).toBe("live");
  });

  test("replay with a Sarvam key makes no network request and says no model was called", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const steps = await collect(runInvestigation({ ...request, mode: "replay" }, { env: { SARVAM_API_KEY: key }, fetchImpl }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(steps.find(s => s.kind === "context" && s.contextId === "run")).toMatchObject({ data: { mode: "replay" } });
  });

  test("health exposes provider and configuration but never keys or a credit claim", async () => {
    vi.stubEnv("SARVAM_API_KEY", key);
    vi.stubEnv("INCIDENT_PROVIDER", "sarvam");
    const status = await GET().json();
    expect(status).toMatchObject({ provider: "Sarvam AI", liveConfigured: true, sarvamConfigured: true, model: "sarvam-105b-conversations" });
    expect(JSON.stringify(status)).not.toContain(key);
    expect(status).not.toHaveProperty("creditsAvailable");
  });
});
