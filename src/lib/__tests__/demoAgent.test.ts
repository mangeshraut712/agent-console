import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoAgentManager } from "../demoAgent";
import type { ServerMessage } from "../types";
import type { WsEvent } from "../websocketManager";

function collect(agent: DemoAgentManager) {
  const events: WsEvent[] = [];
  agent.setHandler((evt) => {
    events.push(evt);
  });
  return {
    events,
    messages: (): ServerMessage[] => events.flatMap((e) => (e.type === "message" ? [e.message] : [])),
    types: (): string[] => events.map((e) => e.type),
  };
}

function ofType<T extends ServerMessage["type"]>(msgs: ServerMessage[], type: T) {
  return msgs.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

async function advanceUntil(done: () => boolean, maxMs = 20_000): Promise<void> {
  let elapsed = 0;
  while (!done() && elapsed < maxMs) {
    await vi.advanceTimersByTimeAsync(50);
    elapsed += 50;
  }
  expect(done()).toBe(true);
}

describe("DemoAgentManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores sends until connect, and connect is idempotent", () => {
    const agent = new DemoAgentManager();
    const { messages, types } = collect(agent);

    agent.send({ type: "USER_MESSAGE", content: "hello" });
    expect(messages()).toEqual([]);

    agent.connect();
    agent.connect();
    expect(types()).toEqual(["connecting", "open"]);

    agent.disconnect();
    expect(types()).toEqual(["connecting", "open", "close"]);
  });

  it("gates TOOL_RESULT behind TOOL_ACK and keeps seq contiguous", async () => {
    const agent = new DemoAgentManager();
    const { messages } = collect(agent);
    agent.connect();
    agent.send({ type: "USER_MESSAGE", content: "summarize the report" });

    await advanceUntil(() => ofType(messages(), "TOOL_CALL").length > 0);
    const call = ofType(messages(), "TOOL_CALL")[0]!;
    expect(ofType(messages(), "TOOL_RESULT")).toEqual([]);

    // Blocked on the ack: time passes but no TOOL_RESULT is emitted.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ofType(messages(), "TOOL_RESULT")).toEqual([]);

    agent.send({ type: "TOOL_ACK", call_id: call.call_id });
    await advanceUntil(() => ofType(messages(), "TOOL_RESULT").length > 0);
    expect(ofType(messages(), "TOOL_RESULT")[0]!.call_id).toBe(call.call_id);

    await advanceUntil(() => ofType(messages(), "STREAM_END").length > 0);
    const seqs = messages().map((m) => m.seq);
    expect(seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1)).toBe(true);

    agent.disconnect();
  });

  it("proceeds past an unacknowledged TOOL_CALL once the ack timeout elapses", async () => {
    const agent = new DemoAgentManager();
    const { messages } = collect(agent);
    agent.connect();
    agent.send({ type: "USER_MESSAGE", content: "summarize the report" });

    await advanceUntil(() => ofType(messages(), "TOOL_CALL").length > 0);
    const call = ofType(messages(), "TOOL_CALL")[0]!;
    await vi.advanceTimersByTimeAsync(5_500);
    expect(ofType(messages(), "TOOL_RESULT").some((r) => r.call_id === call.call_id)).toBe(true);

    agent.disconnect();
  });

  it("RESUME replays exactly the events after last_seq, in order", async () => {
    const agent = new DemoAgentManager();
    const { events, messages, types } = collect(agent);
    agent.connect();
    agent.send({ type: "USER_MESSAGE", content: "hello" });
    await advanceUntil(() => ofType(messages(), "STREAM_END").length > 0);

    const history = messages();
    const mark = events.length;
    agent.send({ type: "RESUME", last_seq: 2 });

    expect(types().slice(mark)[0]).toBe("resuming");
    expect(messages().slice(history.length)).toEqual(history.filter((m) => m.seq > 2));

    agent.disconnect();
  });

  it("a new USER_MESSAGE aborts the in-flight stream and restarts seq at 1", async () => {
    const agent = new DemoAgentManager();
    const { messages } = collect(agent);
    agent.connect();
    agent.send({ type: "USER_MESSAGE", content: "summarize the report" });

    await advanceUntil(() => ofType(messages(), "TOOL_CALL").length > 0);
    const firstCall = ofType(messages(), "TOOL_CALL")[0]!;

    const mark = messages().length;
    agent.send({ type: "USER_MESSAGE", content: "hello" });
    await advanceUntil(() =>
      ofType(messages(), "STREAM_END").some((e) => e.stream_id !== firstCall.stream_id),
    );
    // Let the abandoned stream's 5s ack timeout elapse; it must stay silent.
    await vi.advanceTimersByTimeAsync(6_000);

    const after = messages().slice(mark);
    expect(after[0]!.seq).toBe(1);
    expect(after.some((m) => "stream_id" in m && m.stream_id === firstCall.stream_id)).toBe(false);
    expect(ofType(messages(), "STREAM_END")).toHaveLength(1);
    expect(ofType(messages(), "TOOL_RESULT").some((r) => r.call_id === firstCall.call_id)).toBe(false);

    agent.disconnect();
  });

  it("a stale ack timeout from an abandoned stream does not swallow the new stream's ack", async () => {
    const agent = new DemoAgentManager();
    const { messages } = collect(agent);
    agent.connect();
    agent.send({ type: "USER_MESSAGE", content: "summarize the report" });
    await advanceUntil(() => ofType(messages(), "TOOL_CALL").length > 0);
    const firstCallAt = Date.now();

    // Interrupt mid-tool-call; the retried turn reuses call_id demo_tc_0.
    await vi.advanceTimersByTimeAsync(500);
    const mark = messages().length;
    agent.send({ type: "USER_MESSAGE", content: "summarize the report" });
    await advanceUntil(() => ofType(messages().slice(mark), "TOOL_CALL").length > 0);
    const secondCallAt = Date.now();
    expect(secondCallAt - firstCallAt).toBeGreaterThan(400);

    // Cross the abandoned stream's 5s ack timeout while the new call is still pending.
    const waitMs = firstCallAt + 5_100 - Date.now();
    if (waitMs > 0) {
      await vi.advanceTimersByTimeAsync(waitMs);
    }
    expect(Date.now()).toBeLessThan(secondCallAt + 5_000);

    agent.send({ type: "TOOL_ACK", call_id: "demo_tc_0" });
    await vi.advanceTimersByTimeAsync(320);

    const results = ofType(messages().slice(mark), "TOOL_RESULT");
    expect(results).toHaveLength(1);
    expect(results[0]!.call_id).toBe("demo_tc_0");

    agent.disconnect();
  });
});
