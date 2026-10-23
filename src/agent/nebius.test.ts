import { describe, expect, test } from "vitest";
import { DEFAULT_NEBIUS_BASE_URL, DEFAULT_NEMOTRON_MODEL } from "./constants";
import {
  MissingNebiusApiKeyError,
  InvalidNebiusBaseUrlError,
  NebiusHttpError,
  NebiusResponseError,
  chatCompletionsUrl,
  createChatCompletion,
  nebiusStatus,
  parseNebiusCompletion,
  parseToolArguments,
  resolveNebiusConfig,
} from "./nebius";

describe("Nebius Token Factory client", () => {
  test("missing NEBIUS_API_KEY names the variable and the model", () => {
    expect(() => resolveNebiusConfig({})).toThrow(MissingNebiusApiKeyError);
    try {
      resolveNebiusConfig({ NEBIUS_API_KEY: "   " });
    } catch (error) {
      expect(error).toBeInstanceOf(MissingNebiusApiKeyError);
      expect((error as Error).message).toContain("NEBIUS_API_KEY");
      expect((error as Error).message).toContain(DEFAULT_NEMOTRON_MODEL);
      expect((error as Error).message).toContain("/chat/completions");
    }
  });

  test("status stays usable when the key is absent", () => {
    const status = nebiusStatus({});
    expect(status.nebiusConfigured).toBe(false);
    expect(status.tavilyConfigured).toBe(false);
    expect(status.model).toBe(DEFAULT_NEMOTRON_MODEL);
    expect(status.baseUrl).toBe(DEFAULT_NEBIUS_BASE_URL);
  });

  test("resolveNebiusConfig trims the base URL and honors overrides", () => {
    const config = resolveNebiusConfig({
      NEBIUS_API_KEY: " test-key ",
      NEBIUS_BASE_URL: "https://api.tokenfactory.us-central1.nebius.com/v1/",
      NEBIUS_MODEL: " nvidia/Nemotron-3-Ultra-550b-a55b ",
    });
    expect(config.apiKey).toBe("test-key");
    expect(config.baseUrl).toBe("https://api.tokenfactory.us-central1.nebius.com/v1");
    expect(config.model).toBe("nvidia/Nemotron-3-Ultra-550b-a55b");
    expect(chatCompletionsUrl(config.baseUrl)).toBe(
      "https://api.tokenfactory.us-central1.nebius.com/v1/chat/completions",
    );
  });

  test("createChatCompletion posts to chat/completions with the bearer token", async () => {
    const seen: { url?: string; auth?: string; body?: Record<string, unknown> } = {};
    const fetchImpl: typeof fetch = async (input, init) => {
      seen.url = String(input);
      seen.auth = new Headers(init?.headers).get("Authorization") ?? "";
      seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          model: DEFAULT_NEMOTRON_MODEL,
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "ok", reasoning_content: "thought" },
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2, completion_tokens_details: { reasoning_tokens: 1 } },
        }),
        { status: 200 },
      );
    };

    const completion = await createChatCompletion(
      { apiKey: "secret-key", baseUrl: DEFAULT_NEBIUS_BASE_URL, model: DEFAULT_NEMOTRON_MODEL },
      { messages: [{ role: "user", content: "hello" }] },
      fetchImpl,
    );

    expect(seen.url).toBe(`${DEFAULT_NEBIUS_BASE_URL}/chat/completions`);
    expect(seen.url).not.toContain("secret-key");
    expect(seen.auth).toBe("Bearer secret-key");
    expect(seen.body?.model).toBe(DEFAULT_NEMOTRON_MODEL);
    expect(completion.content).toBe("ok");
    expect(completion.reasoning).toBe("thought");
    expect(completion.usage.reasoningTokens).toBe(1);
  });

  test("rejects credentialed and metadata base URLs and redacts upstream secrets", () => {
    expect(() => resolveNebiusConfig({ NEBIUS_API_KEY: "k", NEBIUS_BASE_URL: "http://169.254.169.254" })).toThrow(
      InvalidNebiusBaseUrlError,
    );
    expect(() =>
      resolveNebiusConfig({ NEBIUS_API_KEY: "k", NEBIUS_BASE_URL: "https://user:secret@example.com/v1" }),
    ).toThrow(/credentials/);
    expect(() => resolveNebiusConfig({ NEBIUS_API_KEY: "k", NEBIUS_BASE_URL: "file:///etc/passwd" })).toThrow(
      /http or https/,
    );
    const httpError = new NebiusHttpError(401, "denied Bearer super-secret-value");
    expect(httpError.message).toContain("401");
    expect(httpError.message).toContain("[redacted]");
    expect(httpError.message).not.toContain("super-secret-value");
  });

  test("parses tool call arguments and the reasoning field", () => {
    const completion = parseNebiusCompletion({
      model: DEFAULT_NEMOTRON_MODEL,
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: null,
            reasoning: "check the database first",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "lookup_service_health",
                  arguments: "{\"service\":\"checkout-api\"}",
                },
              },
            ],
          },
        },
      ],
    });
    expect(completion.reasoning).toBe("check the database first");
    expect(completion.toolCalls).toEqual([
      { id: "call_1", name: "lookup_service_health", arguments: { service: "checkout-api" } },
    ]);
  });

  test("keeps unparsed tool arguments instead of throwing", () => {
    expect(parseToolArguments("not-json")).toEqual({ _unparsed: "not-json" });
    expect(parseToolArguments({ service: "edge-proxy" })).toEqual({ service: "edge-proxy" });
  });

  test("rejects a non-object body, an empty choice list, and non-JSON", async () => {
    expect(() => parseNebiusCompletion(null)).toThrow(NebiusResponseError);
    expect(() => parseNebiusCompletion({ choices: [] })).toThrow(/no choices/);
    const fetchImpl: typeof fetch = async () => new Response("not-json", { status: 200 });
    await expect(
      createChatCompletion(
        { apiKey: "secret-key", baseUrl: DEFAULT_NEBIUS_BASE_URL, model: DEFAULT_NEMOTRON_MODEL },
        { messages: [{ role: "user", content: "hi" }] },
        fetchImpl,
      ),
    ).rejects.toThrow(/non-JSON/);
  });

  test("HTTP errors include the status and body", async () => {
    const fetchImpl: typeof fetch = async () => new Response("invalid api key", { status: 401 });
    await expect(
      createChatCompletion(
        { apiKey: "bad", baseUrl: DEFAULT_NEBIUS_BASE_URL, model: DEFAULT_NEMOTRON_MODEL },
        { messages: [{ role: "user", content: "hi" }] },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(NebiusHttpError);
    try {
      await createChatCompletion(
        { apiKey: "bad", baseUrl: DEFAULT_NEBIUS_BASE_URL, model: DEFAULT_NEMOTRON_MODEL },
        { messages: [{ role: "user", content: "hi" }] },
        fetchImpl,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(NebiusHttpError);
      expect((error as NebiusHttpError).status).toBe(401);
      expect((error as Error).message).toContain("invalid api key");
    }
  });
});
