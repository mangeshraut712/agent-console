import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketManager } from "../websocketManager";
import { acceptOrderedMessages, ReorderBuffer } from "../reorderBuffer";
import { abandonUnconfirmedStream, completeActiveStream } from "../streamLifecycle";
import type { ServerMessage } from "../types";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  closeFromServer(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  receive(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe("WebSocketManager reconnect recovery", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not resume on the first connection before a request starts", () => {
    const manager = new WebSocketManager("ws://example.test/ws");
    manager.connect();

    FakeWebSocket.instances[0]!.open();

    expect(FakeWebSocket.instances[0]!.sent).toEqual([]);
    manager.disconnect();
  });

  it("resumes from zero after reconnecting before the first frame renders", () => {
    const manager = new WebSocketManager("ws://example.test/ws");
    manager.connect();
    const initial = FakeWebSocket.instances[0]!;
    initial.open();

    manager.send({ type: "USER_MESSAGE", content: "recover this turn" });
    initial.closeFromServer();
    vi.advanceTimersByTime(500);

    const reconnected = FakeWebSocket.instances[1]!;
    reconnected.open();

    expect(reconnected.sent).toContain(
      JSON.stringify({ type: "RESUME", last_seq: 0 }),
    );
    manager.disconnect();
  });

  it("continues resuming when a raw terminal frame is still waiting behind a sequence gap", () => {
    const manager = new WebSocketManager("ws://example.test/ws");
    manager.connect();
    const initial = FakeWebSocket.instances[0]!;
    initial.open();

    manager.send({ type: "USER_MESSAGE", content: "out-of-order turn" });
    initial.receive({ type: "STREAM_END", seq: 2, stream_id: "stream-1" });
    initial.closeFromServer();
    vi.advanceTimersByTime(500);

    const reconnected = FakeWebSocket.instances[1]!;
    reconnected.open();

    expect(reconnected.sent).toContain(
      JSON.stringify({ type: "RESUME", last_seq: 0 }),
    );
    manager.disconnect();
  });

  it("does not resume a turn after its stream end was received", () => {
    const manager = new WebSocketManager("ws://example.test/ws");
    manager.connect();
    const initial = FakeWebSocket.instances[0]!;
    initial.open();

    manager.send({ type: "USER_MESSAGE", content: "completed turn" });
    initial.receive({ type: "STREAM_END", seq: 1, stream_id: "stream-1" });
    manager.markStreamActive("stream-1");
    manager.markStreamComplete("stream-1");
    initial.closeFromServer();
    vi.advanceTimersByTime(500);

    const reconnected = FakeWebSocket.instances[1]!;
    reconnected.open();

    expect(reconnected.sent).toEqual([]);
    manager.disconnect();
  });

  it("keeps the active stream resumable when a reordered older stream end arrives", () => {
    const manager = new WebSocketManager("ws://example.test/ws");
    const events = new ReorderBuffer();
    const activeStreamId = "stream-new";

    manager.connect();
    const initial = FakeWebSocket.instances[0]!;
    initial.open();
    manager.send({ type: "USER_MESSAGE", content: "new turn" });
    expect(manager.markStreamActive(activeStreamId)).toBe(true);

    const reordered: ServerMessage[] = [
      { type: "TOKEN", seq: 1, text: "new", stream_id: activeStreamId },
      { type: "STREAM_END", seq: 3, stream_id: "stream-old" },
      { type: "TOKEN", seq: 2, text: " turn", stream_id: activeStreamId },
    ];

    const ordered = reordered.flatMap((message) => acceptOrderedMessages(events, message));
    expect(ordered.map((message) => message.seq)).toEqual([1, 2, 3]);

    for (const message of ordered) {
      manager.setProcessedSeq(message.seq);
      if (message.type === "STREAM_END") {
        expect(message.stream_id).not.toBe(activeStreamId);
        expect(manager.markStreamComplete(message.stream_id)).toBe(false);
      }
    }

    initial.closeFromServer();
    vi.advanceTimersByTime(500);
    const reconnected = FakeWebSocket.instances[1]!;
    reconnected.open();

    expect(reconnected.sent).toContain(
      JSON.stringify({ type: "RESUME", last_seq: 3 }),
    );
    manager.disconnect();
  });

  it("requires an explicit retry after an unavailable resume instead of resending the request", () => {
    const manager = new WebSocketManager("ws://example.test/ws");

    manager.connect();
    const initial = FakeWebSocket.instances[0]!;
    initial.open();
    manager.send({ type: "USER_MESSAGE", content: "ambiguous request" });
    initial.closeFromServer();
    vi.advanceTimersByTime(500);

    const resumed = FakeWebSocket.instances[1]!;
    resumed.open();
    expect(resumed.sent).toEqual([JSON.stringify({ type: "RESUME", last_seq: 0 })]);

    manager.abandonStream();
    resumed.closeFromServer();
    vi.advanceTimersByTime(500);

    const afterFailure = FakeWebSocket.instances[2]!;
    afterFailure.open();
    expect(afterFailure.sent).toEqual([]);

    manager.send({ type: "USER_MESSAGE", content: "manual retry" });
    expect(afterFailure.sent).toEqual([
      JSON.stringify({ type: "USER_MESSAGE", content: "manual retry" }),
    ]);
    manager.disconnect();
  });

  it("keeps the hook's rendered stream active when a reordered stale end arrives before reconnect", () => {
    const manager = new WebSocketManager("ws://example.test/ws");
    const events = new ReorderBuffer();
    const messages = [{ isStreaming: true }];
    let activeStream = { streamId: "stream-new", messageIdx: 0 };

    manager.connect();
    const initial = FakeWebSocket.instances[0]!;
    initial.open();
    manager.send({ type: "USER_MESSAGE", content: "new turn" });
    manager.markStreamActive(activeStream.streamId);

    const reordered: ServerMessage[] = [
      { type: "TOKEN", seq: 1, text: "new", stream_id: "stream-new" },
      { type: "STREAM_END", seq: 3, stream_id: "stream-old" },
      { type: "TOKEN", seq: 2, text: " turn", stream_id: "stream-new" },
    ];

    for (const message of reordered.flatMap((item) => acceptOrderedMessages(events, item))) {
      manager.setProcessedSeq(message.seq);
      if (message.type === "STREAM_END") {
        activeStream = completeActiveStream(activeStream, message.stream_id, messages, manager) ?? activeStream;
      }
    }

    expect(activeStream.streamId).toBe("stream-new");
    expect(messages[0]!.isStreaming).toBe(true);

    initial.closeFromServer();
    vi.advanceTimersByTime(500);
    const reconnected = FakeWebSocket.instances[1]!;
    reconnected.open();
    expect(reconnected.sent).toContain(JSON.stringify({ type: "RESUME", last_seq: 3 }));
    manager.disconnect();
  });

  it("finishes the hook's rendered stream when bounded recovery is unavailable", () => {
    const messages = [{ isStreaming: true }];

    const activeStream = abandonUnconfirmedStream(
      { streamId: "stream-new", messageIdx: 0 },
      messages,
    );

    expect(activeStream).toBeNull();
    expect(messages[0]!.isStreaming).toBe(false);
  });
});
