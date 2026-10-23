import { afterEach, describe, expect, test } from "vitest";
import { DeskAgentManager } from "../deskAgent";
import type { ServerMessage } from "../types";
import type { WsEvent } from "../websocketManager";

const originalFetch = globalThis.fetch;
const originalDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;

function messages(events: WsEvent[]): ServerMessage[] {
  return events.flatMap((event) => (event.type === "message" && event.message ? [event.message] : []));
}

function attach(agent: DeskAgentManager): WsEvent[] {
  const events: WsEvent[] = [];
  agent.setHandler((event) => {
    events.push(event);
    if (event.type === "message" && event.message?.type === "TOOL_CALL") {
      const callId = event.message.call_id;
      queueMicrotask(() => agent.send({ type: "TOOL_ACK", call_id: callId }));
    }
  });
  return events;
}

async function settle(events: WsEvent[]): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const seen = messages(events);
    if (seen.some((message) => message.type === "STREAM_END" || message.type === "ERROR")) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("desk agent did not finish");
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDemoMode === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
  else process.env.NEXT_PUBLIC_DEMO_MODE = originalDemoMode;
});

describe("DeskAgentManager", () => {
  test("ignores sends until connect, and connect is idempotent", () => {
    const agent = new DeskAgentManager();
    const events = attach(agent);
    agent.send({ type: "USER_MESSAGE", content: "checkout is slow" });
    agent.send({ type: "PONG", echo: "x" });
    expect(events).toEqual([]);
    agent.connect();
    agent.connect();
    expect(events.map((event) => event.type)).toEqual(["connecting", "open"]);
    expect(agent.isConnected()).toBe(true);
    expect(agent.getReconnectAttempts()).toBe(0);
    agent.setProcessedSeq(3);
    agent.setProcessedSeq(1);
    expect(agent.getProcessedSeq()).toBe(3);
    agent.resetProcessedSeq();
    expect(agent.getProcessedSeq()).toBe(0);
  });

  test("static demo replays a seeded incident and refuses live mode", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("static demo called the network");
    }) as typeof fetch;

    const replay = new DeskAgentManager();
    const replayEvents = attach(replay);
    replay.connect();
    replay.send({ type: "USER_MESSAGE", content: "incident:auth-5xx\nLogin is failing" });
    await settle(replayEvents);
    const replayMessages = messages(replayEvents);
    expect(calls).toBe(0);
    expect(replayMessages.some((message) => message.type === "TOOL_CALL" && message.tool_name === "web_search")).toBe(
      true,
    );
    expect(
      replayMessages.some(
        (message) => message.type === "CONTEXT_SNAPSHOT" && message.data.mode === "replay" && message.data.disclaimer,
      ),
    ).toBe(true);
    expect(replayMessages.at(-1)?.type).toBe("STREAM_END");

    replay.send({ type: "RESUME", last_seq: 1 });
    expect(replayEvents.some((event) => event.type === "resuming")).toBe(true);
    const replayed = messages(replayEvents).slice(replayMessages.length);
    expect(replayed.every((message) => message.seq > 1)).toBe(true);
    expect(replayed.length).toBeGreaterThan(0);

    const live = new DeskAgentManager();
    const liveEvents = attach(live);
    live.connect();
    live.send({ type: "USER_MESSAGE", content: "incident:auth-5xx\nmode:live\nLogin is failing" });
    await settle(liveEvents);
    const error = messages(liveEvents).find((message) => message.type === "ERROR");
    expect(error && error.type === "ERROR" ? error.code : "").toBe("MISSING_NEBIUS_API_KEY");
    expect(error && error.type === "ERROR" ? error.message : "").toContain("static demo");
    expect(messages(liveEvents).at(-1)?.type).toBe("STREAM_END");
    expect(calls).toBe(0);
  });

  test("HTTP failures, malformed lines, and aborts stay on the protocol", async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    const failed = new DeskAgentManager();
    const failedEvents = attach(failed);
    globalThis.fetch = (async () => new Response("quota exceeded", { status: 429 })) as typeof fetch;
    failed.connect();
    failed.send({ type: "USER_MESSAGE", content: "incident:queue-lag\nmode:replay\nlag" });
    await settle(failedEvents);
    const httpError = messages(failedEvents).find((message) => message.type === "ERROR");
    expect(httpError).toMatchObject({ type: "ERROR", code: "DESK_HTTP", seq: 1 });
    expect(httpError && httpError.type === "ERROR" ? httpError.message : "").toContain("quota exceeded");
    expect(messages(failedEvents).at(-1)).toMatchObject({ type: "STREAM_END", seq: 2 });

    const lines = [
      JSON.stringify({ type: "TOKEN", seq: 1, text: "looking", stream_id: "s1" }),
      "not-json",
      "",
      JSON.stringify({
        type: "TOOL_CALL",
        seq: 2,
        call_id: "tc_1",
        tool_name: "search_logs",
        args: { service: "order-events", query: "poison" },
        stream_id: "s1",
      }),
      JSON.stringify({
        type: "STREAM_END",
        seq: 3,
        stream_id: "s1",
      }),
    ];
    globalThis.fetch = (async () => new Response(lines.join("\n"), { status: 200 })) as typeof fetch;
    const ok = new DeskAgentManager();
    const okEvents = attach(ok);
    ok.connect();
    ok.send({ type: "USER_MESSAGE", content: "incident:queue-lag\nlag" });
    await settle(okEvents);
    expect(messages(okEvents).map((message) => message.type)).toEqual(["TOKEN", "TOOL_CALL", "STREAM_END"]);

    let sawAbort = false;
    globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => {
          sawAbort = true;
          reject(new DOMException("Aborted", "AbortError"));
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      })) as typeof fetch;
    const aborted = new DeskAgentManager();
    const abortedEvents = attach(aborted);
    aborted.connect();
    aborted.send({ type: "USER_MESSAGE", content: "checkout is slow" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    aborted.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sawAbort).toBe(true);
    expect(abortedEvents.some((event) => event.type === "close")).toBe(true);
    expect(messages(abortedEvents).some((message) => message.type === "ERROR")).toBe(false);
    expect(aborted.isConnected()).toBe(false);

    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const crashed = new DeskAgentManager();
    const crashedEvents = attach(crashed);
    crashed.connect();
    crashed.send({ type: "USER_MESSAGE", content: "checkout is slow" });
    await settle(crashedEvents);
    expect(messages(crashedEvents)[0]).toMatchObject({
      type: "ERROR",
      code: "DESK_FAILED",
      message: "network down",
    });
  });
});
