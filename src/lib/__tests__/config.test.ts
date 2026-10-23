import { describe, test, expect } from "vitest";
import { DEFAULT_WS_URL, isDemoEndpoint, isDeskEndpoint, isValidWsUrl } from "../config";

describe("config", () => {
  test("DEFAULT_WS_URL is a valid ws or demo URL", () => {
    expect(isValidWsUrl(DEFAULT_WS_URL)).toBe(true);
  });

  test("isValidWsUrl accepts ws, wss, and demo", () => {
    expect(isValidWsUrl("ws://localhost:4747/ws")).toBe(true);
    expect(isValidWsUrl("wss://agent.example.com/v1/ws")).toBe(true);
    expect(isValidWsUrl("demo://agent")).toBe(true);
    expect(isValidWsUrl("desk://incident")).toBe(true);
  });

  test("isValidWsUrl rejects http and garbage", () => {
    expect(isValidWsUrl("http://localhost:4747/ws")).toBe(false);
    expect(isValidWsUrl("not-a-url")).toBe(false);
    expect(isValidWsUrl("")).toBe(false);
  });

  test("isDemoEndpoint detects demo protocol", () => {
    expect(isDemoEndpoint("demo://agent")).toBe(true);
    expect(isDemoEndpoint("ws://localhost:4747/ws")).toBe(false);
  });

  test("isDeskEndpoint detects the incident desk transport", () => {
    expect(isDeskEndpoint("desk://incident")).toBe(true);
    expect(isDeskEndpoint("ws://localhost:4747/ws")).toBe(false);
  });
});
