import { DEFAULT_NEBIUS_BASE_URL, DEFAULT_NEMOTRON_MODEL, NEBIUS_PROVIDER } from "./constants";
import { fetchWithTimeout, UpstreamTimeoutError } from "./fetchTimeout";
import { redactSecrets } from "./redact";

export type Env = Record<string, string | undefined>;

export interface NebiusConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface FunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface NebiusUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
}

export interface NebiusCompletion {
  model: string;
  content: string;
  reasoning: string;
  toolCalls: ParsedToolCall[];
  finishReason: string | null;
  usage: NebiusUsage;
}

export class MissingNebiusApiKeyError extends Error {
  readonly code = "MISSING_NEBIUS_API_KEY";

  constructor() {
    super(
      `NEBIUS_API_KEY is not set. Create an API key in ${NEBIUS_PROVIDER} and export NEBIUS_API_KEY. Live investigations call ${DEFAULT_NEMOTRON_MODEL} at ${DEFAULT_NEBIUS_BASE_URL}/chat/completions. Until that key is set, run Replay.`,
    );
    this.name = "MissingNebiusApiKeyError";
  }
}

export class NebiusHttpError extends Error {
  readonly code = "NEBIUS_HTTP";

  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`${NEBIUS_PROVIDER} request failed (${status}): ${redactSecrets(body).slice(0, 400)}`);
    this.name = "NebiusHttpError";
  }
}

export class NebiusTimeoutError extends Error {
  readonly code = "NEBIUS_TIMEOUT";

  constructor() {
    super("Nebius Token Factory did not respond before the timeout.");
    this.name = "NebiusTimeoutError";
  }
}

export class InvalidNebiusBaseUrlError extends Error {
  readonly code = "INVALID_NEBIUS_BASE_URL";

  constructor(message: string) {
    super(message);
    this.name = "InvalidNebiusBaseUrlError";
  }
}

export class NebiusResponseError extends Error {
  readonly code = "NEBIUS_RESPONSE";

  constructor(message: string) {
    super(message);
    this.name = "NebiusResponseError";
  }
}

export interface NebiusStatus {
  nebiusConfigured: boolean;
  tavilyConfigured: boolean;
  model: string;
  baseUrl: string;
  provider: string;
}

export function nebiusStatus(env: Env): NebiusStatus {
  return {
    nebiusConfigured: Boolean(env.NEBIUS_API_KEY?.trim()),
    tavilyConfigured: Boolean(env.TAVILY_API_KEY?.trim()),
    model: env.NEBIUS_MODEL?.trim() || DEFAULT_NEMOTRON_MODEL,
    baseUrl: displayBaseUrl(env.NEBIUS_BASE_URL),
    provider: NEBIUS_PROVIDER,
  };
}

export function resolveNebiusConfig(env: Env): NebiusConfig {
  const apiKey = env.NEBIUS_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new MissingNebiusApiKeyError();
  }
  return {
    apiKey,
    baseUrl: safeBaseUrl(env.NEBIUS_BASE_URL?.trim() || DEFAULT_NEBIUS_BASE_URL),
    model: env.NEBIUS_MODEL?.trim() || DEFAULT_NEMOTRON_MODEL,
  };
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/chat/completions`;
}

export function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed as string | number | boolean | null };
  } catch {
    return { _unparsed: value };
  }
}

export function parseNebiusCompletion(payload: unknown): NebiusCompletion {
  if (!payload || typeof payload !== "object") {
    throw new NebiusResponseError("Nebius Token Factory returned a non-object body.");
  }
  const body = payload as Record<string, unknown>;
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new NebiusResponseError("Nebius Token Factory returned no choices.");
  }
  const choice = choices[0] as Record<string, unknown>;
  const message = (choice.message ?? {}) as Record<string, unknown>;
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: ParsedToolCall[] = rawToolCalls.map((entry, index) => {
    const call = entry as Record<string, unknown>;
    const fn = (call.function ?? {}) as Record<string, unknown>;
    const name = typeof fn.name === "string" ? fn.name : "";
    const id = typeof call.id === "string" && call.id ? call.id : `call_${index}`;
    return { id, name, arguments: parseToolArguments(fn.arguments) };
  });
  const reasoning = firstString(message.reasoning_content) || firstString(message.reasoning);
  const usage = (body.usage ?? {}) as Record<string, unknown>;
  const details = (usage.completion_tokens_details ?? {}) as Record<string, unknown>;
  return {
    model: typeof body.model === "string" ? body.model : "",
    content: firstString(message.content),
    reasoning,
    toolCalls: toolCalls.filter((call) => call.name.length > 0),
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
    usage: {
      promptTokens: numberField(usage.prompt_tokens),
      completionTokens: numberField(usage.completion_tokens),
      reasoningTokens: numberField(details.reasoning_tokens),
    },
  };
}

export async function createChatCompletion(
  config: NebiusConfig,
  request: {
    messages: ChatMessage[];
    tools?: FunctionTool[];
    toolChoice?: "auto" | "none";
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<NebiusCompletion> {
  const url = chatCompletionsUrl(config.baseUrl);
  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.toolChoice ?? "auto",
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 4096,
        }),
      },
      45_000,
      request.signal,
    );
  } catch (error) {
    if (error instanceof UpstreamTimeoutError) throw new NebiusTimeoutError();
    throw error;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new NebiusHttpError(response.status, text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new NebiusResponseError("Nebius Token Factory returned non-JSON.");
  }
  return parseNebiusCompletion(parsed);
}

const BLOCKED_BASE_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
]);

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function displayBaseUrl(configured: string | undefined): string {
  try {
    return safeBaseUrl(configured?.trim() || DEFAULT_NEBIUS_BASE_URL);
  } catch {
    return DEFAULT_NEBIUS_BASE_URL;
  }
}

/** http(s) only, no embedded credentials, and not a cloud metadata address. */
export function safeBaseUrl(input: string): string {
  const trimmed = trimBaseUrl(input.trim());
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidNebiusBaseUrlError("NEBIUS_BASE_URL is not a valid URL.");
  }
  if (url.username || url.password) {
    throw new InvalidNebiusBaseUrlError("NEBIUS_BASE_URL must not include credentials.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidNebiusBaseUrlError("NEBIUS_BASE_URL must use http or https.");
  }
  const host = url.hostname.replace(/\.+$/, "").toLowerCase();
  if (BLOCKED_BASE_HOSTS.has(host) || host.endsWith(".metadata.google.internal")) {
    throw new InvalidNebiusBaseUrlError("NEBIUS_BASE_URL cannot target a cloud metadata address.");
  }
  const path = url.pathname.replace(/\/+$/, "");
  const pathname = path === "/" ? "" : path;
  return `${url.origin}${pathname}${url.search}`;
}

function firstString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
