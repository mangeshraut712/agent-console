import { afterEach, describe, expect, test } from "vitest";
import { GET } from "@/app/api/health/route";
import { POST } from "@/app/api/investigate/route";
import { DEFAULT_NEMOTRON_MODEL } from "@/agent/constants";
import { MAX_INVESTIGATION_CHARS, resetInvestigationRateLimit } from "@/agent/requestGuard";

const originalFetch = globalThis.fetch;
const ENV_KEYS = ["NEBIUS_API_KEY", "NEBIUS_BASE_URL", "NEBIUS_MODEL", "TAVILY_API_KEY"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function readMessages(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function investigate(content: unknown, signal?: AbortSignal): Promise<Response> {
  return POST(
    new Request("http://localhost/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal,
    }),
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv();
  resetInvestigationRateLimit();
});

describe("incident desk HTTP routes", () => {
  test("health reports whether Nebius and Tavily are configured", async () => {
    delete process.env.NEBIUS_API_KEY;
    delete process.env.TAVILY_API_KEY;
    const missing = (await (await GET()).json()) as Record<string, unknown>;
    expect(missing.nebiusConfigured).toBe(false);
    expect(missing.tavilyConfigured).toBe(false);
    expect(missing.model).toBe(DEFAULT_NEMOTRON_MODEL);

    process.env.NEBIUS_API_KEY = "live-key";
    process.env.TAVILY_API_KEY = "tvly-test";
    const ready = (await (await GET()).json()) as Record<string, unknown>;
    expect(ready.nebiusConfigured).toBe(true);
    expect(ready.tavilyConfigured).toBe(true);
  });

  test("rejects a body that is not a JSON object with content", async () => {
    const invalid = await POST(
      new Request("http://localhost/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Expected a JSON body." });

    const empty = await investigate("   ");
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "content is required." });

    const wrongShape = await POST(
      new Request("http://localhost/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: 4 }),
      }),
    );
    expect(wrongShape.status).toBe(400);
  });

  test("rejects cross-origin, non-JSON, and oversized investigation requests", async () => {
    const plain = await POST(
      new Request("http://localhost/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ content: "checkout is slow" }),
      }),
    );
    expect(plain.status).toBe(415);

    const foreign = await POST(
      new Request("http://localhost/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
        body: JSON.stringify({ content: "mode:live\ncheckout is slow" }),
      }),
    );
    expect(foreign.status).toBe(403);

    const oversized = await investigate(`incident:checkout-latency\n${"x".repeat(MAX_INVESTIGATION_CHARS)}`);
    expect(oversized.status).toBe(413);
  });

  test("streams a replay without calling the network", async () => {
    delete process.env.NEBIUS_API_KEY;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("replay route called the network");
    }) as typeof fetch;
    const response = await investigate("incident:queue-lag\nmode:replay\norder-events lag is high");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    const messages = await readMessages(response);
    expect(calls).toBe(0);
    expect(messages[0]).toMatchObject({ type: "CONTEXT_SNAPSHOT", seq: 1 });
    const tools = messages.filter((message) => message.type === "TOOL_CALL").map((message) => message.tool_name);
    expect(tools).toEqual([
      "lookup_service_health",
      "lookup_service_health",
      "search_logs",
      "search_logs",
      "read_runbook",
    ]);
    expect(messages.some((message) => message.type === "ERROR")).toBe(false);
    expect(messages.at(-1)?.type).toBe("STREAM_END");
    const sequences = messages.map((message) => message.seq);
    expect(sequences).toEqual([...sequences].sort((a, b) => Number(a) - Number(b)));
  });

  test("maps an unknown incident, a missing key, and a Token Factory error into the stream", async () => {
    delete process.env.NEBIUS_API_KEY;
    const unknown = await readMessages(await investigate("incident:not-a-seed\nmode:replay\nhello"));
    expect(unknown.find((message) => message.type === "ERROR")).toMatchObject({ code: "UNKNOWN_INCIDENT" });
    expect(unknown.at(-1)?.type).toBe("STREAM_END");

    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("quota exceeded", { status: 429 });
    }) as typeof fetch;
    const missingKey = await readMessages(await investigate("incident:checkout-latency\nmode:live\ncheckout is slow"));
    expect(calls).toBe(0);
    expect(missingKey.find((message) => message.type === "ERROR")).toMatchObject({ code: "MISSING_NEBIUS_API_KEY" });

    process.env.NEBIUS_API_KEY = "live-key";
    const httpError = await readMessages(await investigate("incident:checkout-latency\nmode:live\ncheckout is slow"));
    expect(calls).toBe(1);
    const error = httpError.find((message) => message.type === "ERROR");
    expect(error?.code).toBe("NEBIUS_HTTP");
    expect(String(error?.message)).toContain("429");
    expect(String(error?.message)).toContain("quota exceeded");
    expect(httpError.at(-1)?.type).toBe("STREAM_END");
  });

  test("stops a stream that is already aborted", async () => {
    delete process.env.NEBIUS_API_KEY;
    const controller = new AbortController();
    controller.abort();
    const response = await investigate("incident:checkout-latency\nmode:replay\ncheckout is slow", controller.signal);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});
