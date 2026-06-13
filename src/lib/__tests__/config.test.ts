import { describe, test, expect } from "vitest";
import { DEFAULT_WS_URL, isValidWsUrl } from "../config";

describe("config", () => {
  test("DEFAULT_WS_URL is a valid ws URL", () => {
    expect(isValidWsUrl(DEFAULT_WS_URL)).toBe(true);
  });

  test("isValidWsUrl accepts ws and wss", () => {
    expect(isValidWsUrl("ws://localhost:4747/ws")).toBe(true);
    expect(isValidWsUrl("wss://agent.example.com/v1/ws")).toBe(true);
  });

  test("isValidWsUrl rejects http and garbage", () => {
    expect(isValidWsUrl("http://localhost:4747/ws")).toBe(false);
    expect(isValidWsUrl("not-a-url")).toBe(false);
    expect(isValidWsUrl("")).toBe(false);
  });
});
