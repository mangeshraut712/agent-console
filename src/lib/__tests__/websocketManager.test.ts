import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketManager } from "../websocketManager";

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
    manager.markStreamComplete();
    initial.closeFromServer();
    vi.advanceTimersByTime(500);

    const reconnected = FakeWebSocket.instances[1]!;
    reconnected.open();

    expect(reconnected.sent).toEqual([]);
    manager.disconnect();
  });
});
