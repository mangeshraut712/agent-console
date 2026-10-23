import { describe, expect, test } from "vitest";
import { matchesKeyword } from "../keywords";

describe("matchesKeyword", () => {
  test("matches whole tokens and phrases, not fragments", () => {
    expect(matchesKeyword("hi there", "hi")).toBe(true);
    expect(matchesKeyword("which ship is high", "hi")).toBe(false);
    expect(matchesKeyword("good morning team", "good morning")).toBe(true);
    expect(matchesKeyword("checkout latency", "lag")).toBe(false);
    expect(matchesKeyword("consumer lag is 84012", "lag")).toBe(true);
  });
});
