import { describe, test, expect } from "vitest";
import { isServerMessage, parseServerMessage } from "../parseMessage";

describe("parseServerMessage", () => {
  test("parses valid TOKEN", () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: "TOKEN", seq: 1, text: "hi", stream_id: "s1" }),
    );
    expect(msg?.type).toBe("TOKEN");
  });

  test("rejects unknown type", () => {
    expect(parseServerMessage(JSON.stringify({ type: "FOO", seq: 1 }))).toBeNull();
  });

  test("rejects missing seq", () => {
    expect(parseServerMessage(JSON.stringify({ type: "TOKEN" }))).toBeNull();
  });

  test("isServerMessage validates shape", () => {
    expect(isServerMessage({ type: "PING", seq: 0, challenge: "abc" })).toBe(true);
    expect(isServerMessage({ type: "PING", seq: 2, challenge: "" })).toBe(true);
    expect(isServerMessage(null)).toBe(false);
    expect(parseServerMessage(JSON.stringify({ type: "TOKEN", seq: 1.5, text: "a", stream_id: "s" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "TOKEN", seq: 1, stream_id: "s" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "TOOL_CALL", seq: 1, call_id: "c", tool_name: "t", stream_id: "s" }))).toBeNull();
  });
});
