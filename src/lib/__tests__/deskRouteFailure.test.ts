import { describe, expect, test, vi } from "vitest";
import type { AgentStep } from "@/agent/types";

vi.mock("@/agent/investigate", () => ({
  serverEnv: () => ({}),
  runInvestigation: async function* (request: { alert: string }): AsyncGenerator<AgentStep> {
    if (request.alert.includes("string-crash")) throw "boom";
    throw new Error("planner crashed");
  },
}));

import { POST } from "@/app/api/investigate/route";

async function readMessages(content: string): Promise<Array<Record<string, unknown>>> {
  const response = await POST(
    new Request("http://localhost/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  );
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("investigate route failures", () => {
  test("turns a thrown planner error into an in-band AGENT_FAILED frame", async () => {
    const messages = await readMessages("incident:checkout-latency\nmode:replay\ncheckout is slow");
    expect(messages[0]).toMatchObject({
      type: "ERROR",
      seq: 1,
      code: "AGENT_FAILED",
      message: "planner crashed",
    });
    expect(messages[1]).toMatchObject({ type: "STREAM_END", seq: 2 });
  });

  test("uses a generic message when the throw is not an Error", async () => {
    const messages = await readMessages("string-crash");
    expect(messages[0]).toMatchObject({
      type: "ERROR",
      code: "AGENT_FAILED",
      message: "Investigation failed.",
    });
  });
});
