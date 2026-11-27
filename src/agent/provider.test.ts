import { describe, expect, it } from "vitest";
import { DEFAULT_SARVAM_MODEL, SARVAM_BASE_URL } from "./constants";
import type { Env } from "./nebius";
import { ProviderConfigError, providerStatus, selectedProvider } from "./provider";

function env(overrides: Partial<Env> = {}): Env {
  return { ...overrides } as Env;
}

describe("selectedProvider", () => {
  it("falls back to sarvam when nothing usable is configured", () => {
    expect(selectedProvider(env())).toBe("sarvam");
    // A blank key is not a configured key: with a real Nebius key present,
    // a whitespace-only Sarvam key must not win the sniffing.
    expect(selectedProvider(env({ SARVAM_API_KEY: "   ", NEBIUS_API_KEY: "n" }))).toBe("nebius");
  });

  it("honours an explicit INCIDENT_PROVIDER after trimming whitespace", () => {
    expect(selectedProvider(env({ INCIDENT_PROVIDER: "  nebius " }))).toBe("nebius");
    // An explicit choice wins over key sniffing.
    expect(selectedProvider(env({ INCIDENT_PROVIDER: "sarvam", NEBIUS_API_KEY: "n" }))).toBe("sarvam");
  });

  it("rejects unknown INCIDENT_PROVIDER values with a typed error", () => {
    let thrown: unknown;
    try {
      selectedProvider(env({ INCIDENT_PROVIDER: "openai" }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProviderConfigError);
    expect((thrown as ProviderConfigError).code).toBe("INVALID_INCIDENT_PROVIDER");
    expect((thrown as ProviderConfigError).message).toBe(
      "INCIDENT_PROVIDER must be sarvam or nebius.",
    );
  });

  it("prefers a configured sarvam key over nebius, then falls back to nebius", () => {
    expect(selectedProvider(env({ SARVAM_API_KEY: "s", NEBIUS_API_KEY: "n" }))).toBe("sarvam");
    expect(selectedProvider(env({ NEBIUS_API_KEY: "n" }))).toBe("nebius");
  });
});

describe("providerStatus", () => {
  it("describes the selected sarvam provider for the health endpoint", () => {
    expect(providerStatus(env({ SARVAM_API_KEY: "s" }))).toMatchObject({
      providerId: "sarvam",
      liveConfigured: true,
      sarvamConfigured: true,
      keyVariable: "SARVAM_API_KEY",
      model: DEFAULT_SARVAM_MODEL,
      baseUrl: SARVAM_BASE_URL,
    });
  });

  it("degrades to a non-throwing configuration-error status on a bad provider", () => {
    expect(providerStatus(env({ INCIDENT_PROVIDER: "openai" }))).toMatchObject({
      liveConfigured: false,
      provider: "Configuration error",
      error: "INCIDENT_PROVIDER must be sarvam or nebius.",
    });
  });
});
