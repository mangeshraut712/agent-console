import { describe, expect, test } from "vitest";
import { executeTool } from "./tools";
import type { ToolContext } from "./tools";

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    incidentId: "checkout-latency",
    mode: "replay",
    env: {},
    fetchImpl: async () => {
      throw new Error("unexpected fetch");
    },
    ...overrides,
  };
}

describe("incident tools", () => {
  test("unknown tools and missing arguments return errors", async () => {
    expect(await executeTool("drop_database", {}, context())).toEqual({
      error: "Unknown tool",
      tool: "drop_database",
    });
    expect((await executeTool("lookup_service_health", {}, context())).error).toBe("service is required");
    expect((await executeTool("lookup_service_health", { service: "billing-api" }, context())).error).toContain(
      "Unknown service",
    );
    expect((await executeTool("search_logs", { service: "checkout-api" }, context())).error).toBe(
      "service and query are required",
    );
    const missed = await executeTool("search_logs", { service: "checkout-api", query: "certificate" }, context());
    expect(missed.matches).toEqual([]);
    expect(missed.hint).toContain("pool");
    expect((await executeTool("read_runbook", {}, context())).error).toBe("symptom is required");
    const unmatched = await executeTool("read_runbook", { symptom: "purple widgets" }, context());
    expect(unmatched.error).toBe("No runbook section matched.");
    expect(unmatched.available).toEqual(expect.arrayContaining(["Checkout latency", "Consumer lag"]));
    expect((await executeTool("web_search", { query: "  " }, context())).error).toBe("query is required");
  });

  test("replay web search uses the seed and never calls Tavily", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("replay called Tavily");
    };
    const seeded = await executeTool(
      "web_search",
      { query: "Harbor ID certificate" },
      context({
        incidentId: "auth-5xx",
        env: { TAVILY_API_KEY: "present" },
        fetchImpl,
      }),
    );
    expect(calls).toBe(0);
    expect(seeded.live_call).toBe(false);
    expect(seeded.provider).toBe("seeded-replay");
    expect(JSON.stringify(seeded.results)).toContain("ev-vendor-status");

    const empty = await executeTool("web_search", { query: "status" }, context({ fetchImpl }));
    expect(calls).toBe(0);
    expect(empty.results).toEqual([]);
    expect(empty.note).toContain("Tavily was not called");
  });

  test("live web search returns Tavily failures without throwing", async () => {
    const missing = await executeTool(
      "web_search",
      { query: "Harbor ID" },
      context({ mode: "live", env: {} }),
    );
    expect(missing.error).toContain("TAVILY_API_KEY");

    const failed = await executeTool(
      "web_search",
      { query: "Harbor ID" },
      context({
        mode: "live",
        env: { TAVILY_API_KEY: "tvly-test" },
        fetchImpl: async () => new Response("{", { status: 200 }),
      }),
    );
    expect(failed.error).toBe("Tavily returned non-JSON.");
    expect(failed.results).toEqual([]);
  });
});
