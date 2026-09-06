import { describe, test, expect } from "vitest";
import { selectDemoScript, toServerMessages } from "../demoScripts";

describe("selectDemoScript", () => {
  test("matches greeting triggers", () => {
    expect(selectDemoScript("Hello there!").id).toBe("greeting");
  });

  test("matches report summary", () => {
    expect(selectDemoScript("Summarise the Q3 report").id).toBe("report_summary");
  });

  test("falls back to default", () => {
    expect(selectDemoScript("please continue").id).toBe("default");
  });
});

describe("toServerMessages", () => {
  test("emits a complete stream with STREAM_END", () => {
    const script = selectDemoScript("Hello there!");
    const { messages } = toServerMessages(script, "s1");
    expect(messages[0]?.type).toBe("CONTEXT_SNAPSHOT");
    expect(messages.some((m) => m.type === "TOKEN")).toBe(true);
    expect(messages.at(-1)?.type).toBe("STREAM_END");
  });

  test("pairs TOOL_CALL with TOOL_RESULT", () => {
    const script = selectDemoScript("Analyze and compare the data");
    const { messages } = toServerMessages(script, "s2");
    const calls = messages.filter((m) => m.type === "TOOL_CALL");
    const results = messages.filter((m) => m.type === "TOOL_RESULT");
    expect(calls.length).toBeGreaterThan(0);
    expect(results).toHaveLength(calls.length);
  });
});
