import { DEFAULT_SARVAM_MODEL, SARVAM_BASE_URL, SARVAM_PROVIDER, NEBIUS_PROVIDER } from "./constants";
import { createChatCompletion, nebiusStatus, resolveNebiusConfig, type Env, type NebiusConfig } from "./nebius";
import { createSarvamCompletion, resolveSarvamConfig } from "./sarvam";

export type ProviderId = "sarvam" | "nebius";
export type ProviderConfig = NebiusConfig & { id: ProviderId; provider: string; source: string };
export class ProviderConfigError extends Error {
  readonly code = "INVALID_INCIDENT_PROVIDER";
  constructor() { super("INCIDENT_PROVIDER must be sarvam or nebius."); }
}

export function selectedProvider(env: Env): ProviderId {
  const configured = env.INCIDENT_PROVIDER?.trim();
  if (configured === "sarvam" || configured === "nebius") return configured;
  if (configured) throw new ProviderConfigError();
  // Prefer Sarvam for Paytm; retain compatibility for existing Nebius deployments.
  return env.SARVAM_API_KEY?.trim() ? "sarvam" : env.NEBIUS_API_KEY?.trim() ? "nebius" : "sarvam";
}

export function resolveProviderConfig(env: Env): ProviderConfig {
  return selectedProvider(env) === "sarvam"
    ? { ...resolveSarvamConfig(env), id: "sarvam", provider: SARVAM_PROVIDER, source: "sarvam" }
    : { ...resolveNebiusConfig(env), id: "nebius", provider: NEBIUS_PROVIDER, source: "nebius-token-factory" };
}

export function providerStatus(env: Env) {
  const legacy = nebiusStatus(env);
  const sarvamConfigured = Boolean(env.SARVAM_API_KEY?.trim());
  try {
    const id = selectedProvider(env);
    return {
      ...legacy, sarvamConfigured,
      liveConfigured: id === "sarvam" ? sarvamConfigured : legacy.nebiusConfigured,
      providerId: id,
      provider: id === "sarvam" ? SARVAM_PROVIDER : legacy.provider,
      model: id === "sarvam" ? env.SARVAM_MODEL?.trim() || DEFAULT_SARVAM_MODEL : legacy.model,
      baseUrl: id === "sarvam" ? SARVAM_BASE_URL : legacy.baseUrl,
      keyVariable: id === "sarvam" ? "SARVAM_API_KEY" : "NEBIUS_API_KEY",
    };
  } catch {
    return { ...legacy, sarvamConfigured, liveConfigured: false, provider: "Configuration error", error: "INCIDENT_PROVIDER must be sarvam or nebius." };
  }
}

export function createProviderCompletion(config: ProviderConfig, request: Parameters<typeof createChatCompletion>[1], fetchImpl: typeof fetch) {
  return config.id === "sarvam" ? createSarvamCompletion(config, request, fetchImpl) : createChatCompletion(config, request, fetchImpl);
}
