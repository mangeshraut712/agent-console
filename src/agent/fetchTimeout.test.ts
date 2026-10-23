import { describe, expect, test } from "vitest";
import { fetchWithTimeout, UpstreamTimeoutError } from "./fetchTimeout";

describe("fetchWithTimeout", () => {
  test("turns a hung fetch into a timeout error", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    await expect(fetchWithTimeout(fetchImpl, "https://example.com/v1", { method: "POST" }, 20)).rejects.toBeInstanceOf(
      UpstreamTimeoutError,
    );
  });

  test("rethrows the caller abort instead of reporting a timeout", async () => {
    const parent = new AbortController();
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    const pending = fetchWithTimeout(fetchImpl, "https://example.com/v1", { method: "POST" }, 5_000, parent.signal);
    parent.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
