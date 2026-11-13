import { DEFAULT_SARVAM_MODEL, SARVAM_BASE_URL } from "./constants";
import { fetchWithTimeout, UpstreamTimeoutError } from "./fetchTimeout";
import { parseNebiusCompletion, type ChatMessage, type Env, type FunctionTool, type NebiusConfig } from "./nebius";

export class SarvamError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SarvamError";
  }
}

export function resolveSarvamConfig(env: Env): NebiusConfig {
  const apiKey = env.SARVAM_API_KEY?.trim();
  if (!apiKey) throw new SarvamError("MISSING_SARVAM_API_KEY", "Set SARVAM_API_KEY on the server to run a live investigation. Replay does not use a key.");
  return { apiKey, baseUrl: SARVAM_BASE_URL, model: env.SARVAM_MODEL?.trim() || DEFAULT_SARVAM_MODEL };
}

/** Sarvam's official V1 tool-calling contract. Never forwards upstream error bodies. */
export async function createSarvamCompletion(
  config: NebiusConfig,
  request: { messages: ChatMessage[]; tools?: FunctionTool[]; toolChoice?: "auto" | "none"; temperature?: number; maxTokens?: number; signal?: AbortSignal },
  fetchImpl: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetchWithTimeout(fetchImpl, `${SARVAM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "api-subscription-key": config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: request.messages,
        tools: request.tools,
        tool_choice: request.toolChoice ?? "auto",
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096,
        reasoning_effort: "low",
      }),
    }, 45_000, request.signal);
  } catch (error) {
    if (request.signal?.aborted) throw error;
    if (error instanceof UpstreamTimeoutError) throw new SarvamError("SARVAM_TIMEOUT", "Sarvam AI did not respond before the timeout. Try again later.");
    throw new SarvamError("SARVAM_REQUEST", "Could not reach Sarvam AI. Check the server connection and try again.");
  }
  if (!response.ok) {
    // A provider/proxy can echo credentials in its body. Only expose our own messages.
    if (response.status === 402) throw new SarvamError("SARVAM_CREDITS", "Sarvam AI has no credits available (402). Add credits or wait for your hackathon credits, then retry. No replay was substituted.");
    if (response.status === 401 || response.status === 403) throw new SarvamError("SARVAM_AUTH", "Sarvam AI rejected the API key. Check SARVAM_API_KEY on the server.");
    if (response.status === 429) throw new SarvamError("SARVAM_RATE_LIMIT", "Sarvam AI rate limit or quota reached (429). Check your dashboard and retry later.");
    throw new SarvamError("SARVAM_HTTP", `Sarvam AI request failed (${response.status}). Check the model and account in your Sarvam dashboard.`);
  }
  try {
    // Both providers use the OpenAI chat completion response shape.
    return parseNebiusCompletion(await response.json());
  } catch {
    throw new SarvamError("SARVAM_RESPONSE", "Sarvam AI returned an invalid chat completion.");
  }
}
