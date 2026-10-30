import { describe, expect, it, vi } from "vitest";
import { ChaosEngine } from "../../agent-server/src/chaos";
import { AgentServer } from "../../agent-server/src/server";
import type { ResponseScript, ServerMessage } from "../../agent-server/src/types";

const OPEN = 1;

type WritableSocket = {
  readyState: number;
  send: (payload: string) => void;
};

type InternalAgentServer = {
  chaosEngine: ChaosEngine | null;
  delay: (ms: number, signal?: AbortSignal) => Promise<void>;
  runScript: (ws: WritableSocket, script: ResponseScript) => Promise<void>;
  startHeartbeat: (ws: WritableSocket) => void;
  stopHeartbeat: () => void;
  waitForAck: (callId: string) => Promise<void>;
  clientLog: Array<{ type: string; verdict?: string }>;
};

function createChaosHarness(): {
  internal: InternalAgentServer;
  sent: ServerMessage[];
  ws: WritableSocket;
} {
  const server = new AgentServer("chaos");
  const internal = server as unknown as InternalAgentServer;
  const sent: ServerMessage[] = [];
  const ws = {
    readyState: OPEN,
    send(payload: string) {
      sent.push(JSON.parse(payload) as ServerMessage);
    },
  };

  internal.chaosEngine = new ChaosEngine({
    dropAfterMessages: null,
    reorderProbability: 1,
    duplicateProbability: 0,
    latencySpikeProbability: 0,
    latencySpikeMs: [0, 0],
    corruptPingProbability: 0,
  });
  internal.delay = async () => {};

  return { internal, sent, ws };
}

describe("AgentServer chaos delivery barriers", () => {
  it("delivers a chaos-buffered TOOL_CALL before it awaits its acknowledgment", async () => {
    const { internal, sent, ws } = createChaosHarness();
    internal.waitForAck = async () => {
      expect(sent.map((message) => message.type)).toContain("TOOL_CALL");
    };

    await expect(internal.runScript(ws, {
      id: "tool-call-barrier",
      name: "Tool call barrier",
      triggers: [],
      events: [{
        kind: "tool_call",
        tool_name: "lookup_metric",
        args: { metric: "revenue" },
        result: { value: "23.4%" },
      }],
    })).resolves.toBeUndefined();
  });

  it("flushes a chaos-buffered STREAM_END before the stream returns", async () => {
    const { internal, sent, ws } = createChaosHarness();

    await internal.runScript(ws, {
      id: "stream-end-barrier",
      name: "Stream end barrier",
      triggers: [],
      events: [{ kind: "token", text: "complete" }],
    });

    expect(sent.map((message) => message.type)).toEqual(["TOKEN", "STREAM_END"]);
  });

  it("does not count a deliberately corrupt empty PING as an unanswered heartbeat", async () => {
    const { internal, sent, ws } = createChaosHarness();
    internal.chaosEngine = new ChaosEngine({
      dropAfterMessages: null,
      reorderProbability: 0,
      duplicateProbability: 0,
      latencySpikeProbability: 0,
      latencySpikeMs: [0, 0],
      corruptPingProbability: 1,
    });

    vi.useFakeTimers();
    try {
      internal.startHeartbeat(ws);
      await vi.advanceTimersByTimeAsync(24_000);

      expect(sent.some((message) => message.type === "PING" && message.challenge === "")).toBe(true);
      expect(internal.clientLog.filter((entry) => entry.type === "PONG_TIMEOUT")).toHaveLength(0);
    } finally {
      internal.stopHeartbeat();
      vi.useRealTimers();
    }
  });

  it("still records an unanswered nonempty PING as a PONG timeout", async () => {
    const { internal, sent, ws } = createChaosHarness();

    vi.useFakeTimers();
    try {
      internal.startHeartbeat(ws);
      await vi.advanceTimersByTimeAsync(24_000);

      expect(sent.some((message) => message.type === "PING" && message.challenge !== "")).toBe(true);
      expect(internal.clientLog.filter((entry) => entry.type === "PONG_TIMEOUT")).toHaveLength(1);
    } finally {
      internal.stopHeartbeat();
      vi.useRealTimers();
    }
  });
});
