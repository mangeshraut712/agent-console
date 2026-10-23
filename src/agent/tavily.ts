import { fetchWithTimeout, UpstreamTimeoutError } from "./fetchTimeout";
import type { Env } from "./nebius";
import { redactSecrets } from "./redact";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export async function tavilySearch(
  query: string,
  env: Env,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const apiKey = env.TAVILY_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      provider: "tavily",
      source: "tavily",
      live_call: false,
      configured: false,
      query,
      error: "TAVILY_API_KEY is not set. Web search is unavailable. Continue with the internal tools.",
      results: [],
    };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      TAVILY_SEARCH_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: 5,
          include_answer: false,
        }),
      },
      15_000,
      signal,
    );
  } catch (error) {
    if (!(error instanceof UpstreamTimeoutError)) throw error;
    return {
      provider: "tavily",
      source: "tavily",
      live_call: true,
      configured: true,
      query,
      error: error.message,
      results: [],
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      provider: "tavily",
      source: "tavily",
      live_call: true,
      configured: true,
      query,
      error: `Tavily search failed (${response.status}): ${redactSecrets(text).slice(0, 300)}`,
      results: [],
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return {
      provider: "tavily",
      source: "tavily",
      live_call: true,
      configured: true,
      query,
      error: "Tavily returned non-JSON.",
      results: [],
    };
  }

  const results = Array.isArray((payload as { results?: unknown }).results)
    ? ((payload as { results: unknown[] }).results)
    : [];

  return {
    provider: "tavily",
    source: "tavily",
    live_call: true,
    configured: true,
    query,
    results: results.slice(0, 5).map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        title: typeof row.title === "string" ? row.title : "",
        url: typeof row.url === "string" ? row.url : "",
        content: typeof row.content === "string" ? row.content.slice(0, 500) : "",
      };
    }),
  };
}
