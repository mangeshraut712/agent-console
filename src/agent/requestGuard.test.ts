import { describe, expect, test } from "vitest";
import {
  MAX_BODY_CHARS,
  rejectInvestigationContent,
  rejectInvestigationRequest,
  resetInvestigationRateLimit,
  takeInvestigationSlot,
} from "./requestGuard";

describe("investigation request guard", () => {
  test("allows same-origin JSON and blocks cross-site simple posts", () => {
    const same = new Request("http://localhost:3000/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: "{}",
    });
    expect(rejectInvestigationRequest(same, "{}")).toBeNull();

    const foreign = new Request("http://localhost:3000/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: "https://evil.example" },
      body: "{}",
    });
    expect(rejectInvestigationRequest(foreign, "{}")?.status).toBe(415);

    const jsonForeign = new Request("http://localhost:3000/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: "{}",
    });
    expect(rejectInvestigationRequest(jsonForeign, "{}")?.status).toBe(403);

    const loopback = new Request("http://localhost:3000/api/investigate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "127.0.0.1:3000",
        Origin: "http://127.0.0.1:3000",
      },
      body: "{}",
    });
    expect(rejectInvestigationRequest(loopback, "{}")).toBeNull();
  });

  test("rejects oversized bodies and contents", () => {
    const request = new Request("http://localhost/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(MAX_BODY_CHARS + 1) },
    });
    expect(rejectInvestigationRequest(request, "{}")?.status).toBe(413);
    expect(rejectInvestigationContent("x".repeat(16_001))?.status).toBe(413);
  });

  test("rate limit closes after the budget inside one window", () => {
    resetInvestigationRateLimit();
    expect(takeInvestigationSlot("client-a", 1_000, 2)).toBe(true);
    expect(takeInvestigationSlot("client-a", 1_100, 2)).toBe(true);
    expect(takeInvestigationSlot("client-a", 1_200, 2)).toBe(false);
    expect(takeInvestigationSlot("client-b", 1_200, 2)).toBe(true);
    expect(takeInvestigationSlot("client-a", 1_000 + 60_000, 2)).toBe(true);
  });
});
