import { describe, expect, test } from "vitest";
import { DEFAULT_NEBIUS_BASE_URL, DEFAULT_NEMOTRON_MODEL, REPLAY_DISCLAIMER } from "./constants";
import { scoreInvestigation } from "./eval";
import { INCIDENTS } from "./incidents";
import { runInvestigation } from "./investigate";
import { MissingNebiusApiKeyError } from "./nebius";
import { parseInvestigationContent, resolveMode } from "./parseRequest";
import { ProtocolEncoder } from "./protocol";
import type { AgentStep, Verdict } from "./types";

const VERDICT: Verdict = {
  severity: "sev2",
  likely_cause: "The connection pool is saturated.",
  evidence_ids: ["ev-checkout-pool"],
  recommended_action: "Roll the checkout-api pool size back to 20 and watch p99.",
  confidence: "high",
  summary: "Checkout latency is a connection pool problem.",
};

async function collect(gen: AsyncGenerator<AgentStep>): Promise<AgentStep[]> {
  const steps: AgentStep[] = [];
  for await (const step of gen) steps.push(step);
  return steps;
}

function chatBody(message: Record<string, unknown>, finishReason: string): string {
  return JSON.stringify({
    model: DEFAULT_NEMOTRON_MODEL,
    choices: [{ index: 0, finish_reason: finishReason, message }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 6,
      completion_tokens_details: { reasoning_tokens: 2 },
    },
  });
}

function toolMessage(id: string, name: string, args: Record<string, unknown>, reasoning: string): Record<string, unknown> {
  return {
    role: "assistant",
    content: null,
    reasoning_content: reasoning,
    tool_calls: [
      {
        id,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

describe("incident agent loop", () => {
  test("replay traces are labeled, skip the network, and pass the scorecard", async () => {
    for (const incident of INCIDENTS) {
      let calls = 0;
      const fetchImpl: typeof fetch = async () => {
        calls += 1;
        throw new Error("replay called the network");
      };
      const steps = await collect(
        runInvestigation(
          { incidentId: incident.id, alert: incident.alert, mode: "replay" },
          { env: { NEBIUS_API_KEY: "present-but-unused" }, fetchImpl },
        ),
      );
      expect(calls).toBe(0);
      const run = steps.find((step) => step.kind === "context" && step.contextId === "run");
      expect(run && run.kind === "context" ? run.data.mode : "").toBe("replay");
      expect(run && run.kind === "context" ? run.data.disclaimer : "").toBe(REPLAY_DISCLAIMER);
      expect(JSON.stringify(run)).not.toContain('"mode":"live"');

      const toolNames = steps.flatMap((step) => (step.kind === "tool_call" ? [step.toolName] : []));
      const services = steps.flatMap((step) => {
        if (step.kind !== "tool_call") return [];
        const service = step.args.service;
        return typeof service === "string" ? [service] : [];
      });
      const verdictStep = [...steps].reverse().find((step) => step.kind === "context" && step.contextId === "verdict");
      const narrative = steps.flatMap((step) => (step.kind === "token" ? [step.text] : [])).join("");
      const report = scoreInvestigation({
        incidentId: incident.id,
        toolNames,
        services,
        verdict: verdictStep && verdictStep.kind === "context" ? (verdictStep.data as unknown as Verdict) : null,
        narrative,
      });
      expect(report?.passed).toBe(report?.total);
    }
  });

  test("live mode without a key returns a clear error and does not call fetch", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not run");
    };
    const steps = await collect(
      runInvestigation(
        { incidentId: "checkout-latency", alert: "checkout is slow", mode: "live" },
        { env: {}, fetchImpl },
      ),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: "error", code: "MISSING_NEBIUS_API_KEY" });
    expect(steps[0]?.kind === "error" ? steps[0].message : "").toContain("NEBIUS_API_KEY");
  });

  test("live mode plans with Nemotron, runs tools, and feeds results back", async () => {
    const requests: Array<{ url: string; auth: string; body: Record<string, unknown> }> = [];
    const script = [
      chatBody(
        toolMessage("call_health", "lookup_service_health", { service: "checkout-api" }, "Read checkout-api health first."),
        "tool_calls",
      ),
      chatBody(
        toolMessage("call_logs", "search_logs", { service: "checkout-api", query: "pool" }, "Health is bad. Search pool logs."),
        "tool_calls",
      ),
      chatBody(
        toolMessage("call_book", "read_runbook", { symptom: "checkout latency" }, "Logs show a pool timeout. Read the runbook."),
        "tool_calls",
      ),
      chatBody(
        {
          role: "assistant",
          content: `The pool is exhausted.\n\`\`\`json\n${JSON.stringify(VERDICT)}\n\`\`\``,
          reasoning_content: "The runbook says to roll the pool back.",
        },
        "stop",
      ),
    ];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        auth: new Headers(init?.headers).get("Authorization") ?? "",
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      const next = script.shift();
      if (!next) throw new Error("unexpected extra model call");
      return new Response(next, { status: 200 });
    };

    const steps = await collect(
      runInvestigation(
        { incidentId: "checkout-latency", alert: INCIDENTS[0]!.alert, mode: "live" },
        { env: { NEBIUS_API_KEY: "live-key" }, fetchImpl },
      ),
    );

    expect(requests).toHaveLength(4);
    expect(requests[0]?.url).toBe(`${DEFAULT_NEBIUS_BASE_URL}/chat/completions`);
    expect(requests[0]?.auth).toBe("Bearer live-key");
    expect(requests[0]?.body.model).toBe(DEFAULT_NEMOTRON_MODEL);
    expect(requests[0]?.body.tool_choice).toBe("auto");

    const secondMessages = requests[1]?.body.messages as Array<Record<string, unknown>>;
    const toolResult = secondMessages.find((message) => message.role === "tool");
    expect(toolResult?.tool_call_id).toBe("call_health");
    expect(String(toolResult?.content)).toContain("ev-checkout-latency");
    const assistant = secondMessages.find((message) => message.role === "assistant");
    expect(assistant?.reasoning_content).toContain("checkout-api");

    const planner = steps.find((step) => step.kind === "context" && step.contextId === "planner");
    expect(planner && planner.kind === "context" ? planner.data.reasoning : "").toContain("checkout-api");
    expect(planner && planner.kind === "context" ? planner.data.mode : "").toBe("live");

    const tools = steps.filter((step) => step.kind === "tool_call");
    expect(tools.map((step) => (step.kind === "tool_call" ? step.toolName : ""))).toEqual([
      "lookup_service_health",
      "search_logs",
      "read_runbook",
    ]);
    const verdict = steps.find((step) => step.kind === "context" && step.contextId === "verdict");
    expect(verdict && verdict.kind === "context" ? verdict.data.likely_cause : "").toContain("pool");
    const run = steps.find((step) => step.kind === "context" && step.contextId === "run");
    expect(run && run.kind === "context" ? run.data.prompt_tokens : 0).toBe(40);
    expect(run && run.kind === "context" ? run.data.model : "").toBe(DEFAULT_NEMOTRON_MODEL);
  });

  test("web_search calls Tavily when the key is set and reports a clear gap when it is not", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      if (isTavilySearchUrl(url)) {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tvly-test");
        return new Response(
          JSON.stringify({
            results: [{ title: "status", url: "https://status.example.invalid/harbor", content: "certificate rotated" }],
          }),
          { status: 200 },
        );
      }
      if (urls.filter((item) => isChatCompletionsUrl(item)).length === 1) {
        return new Response(
          chatBody(toolMessage("call_web", "web_search", { query: "Harbor ID certificate" }, "Check the vendor."), "tool_calls"),
          { status: 200 },
        );
      }
      return new Response(
        chatBody(
          {
            role: "assistant",
            content: `Vendor page says the certificate rotated.\n${JSON.stringify({
              ...VERDICT,
              likely_cause: "The upstream certificate expired.",
              evidence_ids: ["ev-idp-cert"],
              summary: "The certificate expired.",
            })}`,
          },
          "stop",
        ),
        { status: 200 },
      );
    };

    const withKey = await collect(
      runInvestigation(
        { incidentId: "auth-5xx", alert: "login 500", mode: "live" },
        { env: { NEBIUS_API_KEY: "live-key", TAVILY_API_KEY: "tvly-test" }, fetchImpl },
      ),
    );
    expect(urls.some((url) => isTavilySearchUrl(url))).toBe(true);
    const web = withKey.find((step) => step.kind === "tool_call" && step.toolName === "web_search");
    expect(web && web.kind === "tool_call" ? web.result.live_call : false).toBe(true);

    const fetchWithoutTavily: typeof fetch = async () =>
      new Response(
        chatBody(toolMessage("call_web", "web_search", { query: "Harbor ID" }, "Look outside."), "tool_calls"),
        { status: 200 },
      );
    const missing = await collect(
      runInvestigation(
        { incidentId: "auth-5xx", alert: "login 500", mode: "live" },
        {
          env: { NEBIUS_API_KEY: "live-key" },
          fetchImpl: queueFinal(fetchWithoutTavily),
          maxModelCalls: 2,
        },
      ),
    );
    const gap = missing.find((step) => step.kind === "tool_call" && step.toolName === "web_search");
    expect(gap && gap.kind === "tool_call" ? gap.result.error : "").toContain("TAVILY_API_KEY");
  });

  test("stops at the model-call budget", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(
        chatBody(toolMessage(`call_${calls}`, "lookup_service_health", { service: "checkout-api" }, "again"), "tool_calls"),
        { status: 200 },
      );
    };
    const steps = await collect(
      runInvestigation(
        { incidentId: "checkout-latency", alert: "checkout", mode: "live" },
        { env: { NEBIUS_API_KEY: "live-key" }, fetchImpl, maxModelCalls: 2 },
      ),
    );
    expect(calls).toBe(2);
    expect(steps.some((step) => step.kind === "error" && step.code === "STEP_BUDGET")).toBe(true);
  });

  test("a Token Factory HTTP failure is an in-band error", async () => {
    const fetchImpl: typeof fetch = async () => new Response("quota exceeded", { status: 429 });
    const steps = await collect(
      runInvestigation(
        { incidentId: "queue-lag", alert: "lag", mode: "live" },
        { env: { NEBIUS_API_KEY: "live-key" }, fetchImpl },
      ),
    );
    const error = steps.find((step) => step.kind === "error");
    expect(error && error.kind === "error" ? error.message : "").toContain("429");
    expect(error && error.kind === "error" ? error.message : "").toContain("quota exceeded");
  });

  test("request parsing and mode resolution", () => {
    const parsed = parseInvestigationContent("incident:auth-5xx\nmode:live\nLogin is failing");
    expect(parsed).toEqual({ incidentId: "auth-5xx", alert: "Login is failing", mode: "live" });
    expect(resolveMode("auto", {})).toBe("replay");
    expect(resolveMode("auto", { NEBIUS_API_KEY: "k" })).toBe("live");
    expect(resolveMode("replay", { NEBIUS_API_KEY: "k" })).toBe("replay");
    expect(parseInvestigationContent("the checkout p99 is high").incidentId).toBe("checkout-latency");
  });

  test("protocol encoder numbers tool call and result in order", () => {
    const encoder = new ProtocolEncoder("s_test");
    const messages = encoder.encode({
      kind: "tool_call",
      toolName: "search_logs",
      args: { service: "order-events", query: "schema" },
      result: { matches: [] },
    });
    expect(messages.map((message) => message.type)).toEqual(["TOOL_CALL", "TOOL_RESULT"]);
    expect(messages.map((message) => message.seq)).toEqual([1, 2]);
    expect(encoder.end().seq).toBe(3);
  });

  test("MissingNebiusApiKeyError is the live-mode guard", () => {
    expect(new MissingNebiusApiKeyError().code).toBe("MISSING_NEBIUS_API_KEY");
  });

  test("Tavily routing accepts only the parsed api.tavily.com search URL", () => {
    expect(isTavilySearchUrl("https://api.tavily.com/search")).toBe(true);
    expect(isTavilySearchUrl("https://api.tavily.com.evil.example/search")).toBe(false);
    expect(isTavilySearchUrl("https://evil.example/search?next=https://api.tavily.com/search")).toBe(false);
    expect(isTavilySearchUrl("https://user:api.tavily.com@evil.example/search")).toBe(false);
    expect(isTavilySearchUrl("http://api.tavily.com/search")).toBe(false);
    expect(isTavilySearchUrl("not a url")).toBe(false);
    expect(isChatCompletionsUrl(`${DEFAULT_NEBIUS_BASE_URL}/chat/completions`)).toBe(true);
    expect(isChatCompletionsUrl("https://api.tavily.com/search")).toBe(false);
  });

  test("unknown incidents fail before any network call", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("unknown incident called the network");
    };
    for (const mode of ["live", "replay"] as const) {
      const steps = await collect(
        runInvestigation(
          { incidentId: "not-a-seed", alert: "something broke", mode },
          { env: { NEBIUS_API_KEY: "live-key" }, fetchImpl },
        ),
      );
      expect(steps).toEqual([
        expect.objectContaining({
          kind: "error",
          code: "UNKNOWN_INCIDENT",
        }),
      ]);
      expect(steps[0]?.kind === "error" ? steps[0].message : "").toContain("checkout-latency");
    }
    expect(calls).toBe(0);
  });

  test("an empty model answer and a transport failure stay in-band", async () => {
    const empty = await collect(
      runInvestigation(
        { incidentId: "queue-lag", alert: "lag", mode: "live" },
        {
          env: { NEBIUS_API_KEY: "live-key" },
          fetchImpl: async () =>
            new Response(chatBody({ role: "assistant", content: "   " }, "stop"), { status: 200 }),
        },
      ),
    );
    expect(empty.some((step) => step.kind === "error" && step.code === "EMPTY_MODEL_RESPONSE")).toBe(true);
    expect(empty.some((step) => step.kind === "context" && step.contextId === "run")).toBe(true);

    const broken = await collect(
      runInvestigation(
        { incidentId: "queue-lag", alert: "lag", mode: "live" },
        {
          env: { NEBIUS_API_KEY: "live-key" },
          fetchImpl: async () => new Response("not-json", { status: 200 }),
        },
      ),
    );
    const parseError = broken.find((step) => step.kind === "error");
    expect(parseError && parseError.kind === "error" ? parseError.code : "").toBe("NEBIUS_REQUEST");
    expect(parseError && parseError.kind === "error" ? parseError.message : "").toContain("non-JSON");

    const down = await collect(
      runInvestigation(
        { incidentId: "queue-lag", alert: "lag", mode: "live" },
        {
          env: { NEBIUS_API_KEY: "live-key" },
          fetchImpl: async () => {
            throw new Error("socket hang up");
          },
        },
      ),
    );
    expect(down.find((step) => step.kind === "error")).toMatchObject({
      kind: "error",
      code: "NEBIUS_REQUEST",
      message: "socket hang up",
    });

    const opaque = await collect(
      runInvestigation(
        { incidentId: "queue-lag", alert: "lag", mode: "live" },
        {
          env: { NEBIUS_API_KEY: "live-key" },
          fetchImpl: (async () => {
            throw "offline";
          }) as typeof fetch,
        },
      ),
    );
    expect(opaque.find((step) => step.kind === "error")).toMatchObject({
      kind: "error",
      code: "NEBIUS_REQUEST",
      message: "Nebius Token Factory request failed.",
    });
  });

  test("an unknown tool and a thrown web search stay inside the tool result", async () => {
    const script = [
      chatBody(toolMessage("call_bad", "drop_database", { target: "payments-db" }, "This tool is not in the catalog."), "tool_calls"),
      chatBody(
        toolMessage("call_web", "web_search", { query: "vendor status" }, "Look outside after the unknown tool."),
        "tool_calls",
      ),
      chatBody(
        {
          role: "assistant",
          content: `The catalog rejected the first tool.\n${JSON.stringify({
            ...VERDICT,
            likely_cause: "certificate expired",
            evidence_ids: ["ev-idp-cert"],
            summary: "certificate expired",
          })}`,
        },
        "stop",
      ),
    ];
    const steps = await collect(
      runInvestigation(
        { incidentId: "auth-5xx", alert: "login 500", mode: "live" },
        {
          env: { NEBIUS_API_KEY: "live-key", TAVILY_API_KEY: "tvly-test" },
          fetchImpl: async (input) => {
            if (isTavilySearchUrl(String(input))) throw new Error("tavily unreachable");
            const next = script.shift();
            if (!next) throw new Error("unexpected extra model call");
            return new Response(next, { status: 200 });
          },
        },
      ),
    );
    const unknown = steps.find((step) => step.kind === "tool_call" && step.toolName === "drop_database");
    expect(unknown && unknown.kind === "tool_call" ? unknown.result : {}).toEqual({
      error: "Unknown tool",
      tool: "drop_database",
    });
    const web = steps.find((step) => step.kind === "tool_call" && step.toolName === "web_search");
    expect(web && web.kind === "tool_call" ? web.result.error : "").toBe("tavily unreachable");
    expect(steps.some((step) => step.kind === "context" && step.contextId === "verdict")).toBe(true);
    expect(steps.some((step) => step.kind === "error")).toBe(false);
  });

  test("a narrative without a verdict ends the run instead of inventing one", async () => {
    const steps = await collect(
      runInvestigation(
        { incidentId: "checkout-latency", alert: "checkout", mode: "live" },
        {
          env: { NEBIUS_API_KEY: "live-key" },
          fetchImpl: async () =>
            new Response(
              chatBody(
                { role: "assistant", content: "I need another look before I name a cause." },
                "stop",
              ),
              { status: 200 },
            ),
        },
      ),
    );
    expect(steps.some((step) => step.kind === "token")).toBe(true);
    expect(steps.some((step) => step.kind === "context" && step.contextId === "verdict")).toBe(false);
    expect(steps.some((step) => step.kind === "error")).toBe(false);
    expect(steps.some((step) => step.kind === "context" && step.contextId === "run")).toBe(true);
  });
});

const TAVILY_SEARCH_HOST = "api.tavily.com";

function requestUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isTavilySearchUrl(value: string): boolean {
  const parsed = requestUrl(value);
  return parsed?.protocol === "https:" && parsed.hostname === TAVILY_SEARCH_HOST && parsed.pathname === "/search";
}

function isChatCompletionsUrl(value: string): boolean {
  const parsed = requestUrl(value);
  return parsed?.pathname.endsWith("/chat/completions") === true;
}

function queueFinal(first: typeof fetch): typeof fetch {
  let count = 0;
  return async (input, init) => {
    count += 1;
    if (count === 1) return first(input, init);
    return new Response(
      chatBody(
        {
          role: "assistant",
          content: JSON.stringify({
            ...VERDICT,
            likely_cause: "certificate expired",
            summary: "certificate expired",
          }),
        },
        "stop",
      ),
      { status: 200 },
    );
  };
}
