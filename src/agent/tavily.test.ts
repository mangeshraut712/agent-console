import { describe, expect, test } from "vitest";
import { tavilySearch } from "./tavily";

const QUERY = "Harbor ID certificate";

describe("tavilySearch", () => {
  test("reports a clear gap and does not call fetch when the key is missing", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("fetch should not run");
    };
    const result = await tavilySearch(QUERY, { TAVILY_API_KEY: "   " }, fetchImpl);
    expect(calls).toBe(0);
    expect(result.configured).toBe(false);
    expect(result.live_call).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toContain("TAVILY_API_KEY");
  });

  test("returns the status and a truncated body when Tavily rejects the request", async () => {
    const body = `denied ${"x".repeat(400)}`;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("api.tavily.com");
      expect(url.pathname).toBe("/search");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tvly-test");
      expect(JSON.parse(String(init?.body))).toMatchObject({ query: QUERY, max_results: 5 });
      return new Response(body, { status: 401 });
    };
    const result = await tavilySearch(QUERY, { TAVILY_API_KEY: "tvly-test" }, fetchImpl);
    expect(result.live_call).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.results).toEqual([]);
    expect(String(result.error)).toContain("401");
    expect(String(result.error)).toContain("denied");
    expect(String(result.error).length).toBeLessThan(body.length);
  });

  test("reports non-JSON and keeps only the first five trimmed results", async () => {
    const bad: typeof fetch = async () => new Response("nope", { status: 200 });
    const invalid = await tavilySearch(QUERY, { TAVILY_API_KEY: "tvly-test" }, bad);
    expect(invalid.error).toBe("Tavily returned non-JSON.");
    expect(invalid.results).toEqual([]);

    const long = `${"a".repeat(600)} tail`;
    const rows = Array.from({ length: 6 }, (_, index) => ({
      title: index === 0 ? 12 : `page ${index}`,
      url: index === 1 ? null : `https://status.example.invalid/${index}`,
      content: index === 2 ? long : `note ${index}`,
    }));
    const ok: typeof fetch = async () => new Response(JSON.stringify({ results: rows }), { status: 200 });
    const result = await tavilySearch(QUERY, { TAVILY_API_KEY: " tvly-test " }, ok);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({ title: "", content: "note 0" });
    expect(results[1]).toMatchObject({ url: "", content: "note 1" });
    expect(String(results[2]?.content)).toHaveLength(500);
    expect(String(results[2]?.content)).not.toContain("tail");
  });
});
