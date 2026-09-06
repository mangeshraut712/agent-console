import type { ClientMessage, ServerMessage } from "./types";
import type { WsEvent, WsEventHandler } from "./websocketManager";
import { selectDemoScript, type DemoScript } from "./demoScripts";

const TOKEN_DELAY_MS = 35;
const TOOL_RESULT_DELAY_MS = 280;
const ACK_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 8000;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * In-browser stand-in for the mock agent-server.
 * Speaks the same handler events as WebSocketManager so the UI can run on GitHub Pages.
 */
export class DemoAgentManager {
  private handler: WsEventHandler | null = null;
  private connected = false;
  private processedSeq = 0;
  private seq = 0;
  private eventHistory: ServerMessage[] = [];
  private streamAbort: AbortController | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingAcks = new Map<string, () => void>();

  setHandler(handler: WsEventHandler): void {
    this.handler = handler;
  }

  connect(): void {
    if (this.connected) return;
    this.emit({ type: "connecting" });
    this.connected = true;
    this.emit({ type: "open" });
    this.startPing();
  }

  disconnect(): void {
    this.connected = false;
    this.abortStream();
    this.stopPing();
    this.pendingAcks.clear();
    this.emit({ type: "close" });
  }

  send(msg: ClientMessage): void {
    if (!this.connected) return;

    switch (msg.type) {
      case "USER_MESSAGE":
        void this.handleUserMessage(msg.content);
        break;
      case "TOOL_ACK": {
        const resolve = this.pendingAcks.get(msg.call_id);
        if (resolve) {
          this.pendingAcks.delete(msg.call_id);
          resolve();
        }
        break;
      }
      case "RESUME":
        this.handleResume(msg.last_seq);
        break;
      case "PONG":
        break;
      default: {
        const _exhaustive: never = msg;
        return _exhaustive;
      }
    }
  }

  setProcessedSeq(seq: number): void {
    if (seq > this.processedSeq) {
      this.processedSeq = seq;
    }
  }

  resetProcessedSeq(): void {
    this.processedSeq = 0;
  }

  getProcessedSeq(): number {
    return this.processedSeq;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getReconnectAttempts(): number {
    return 0;
  }

  private handleResume(lastSeq: number): void {
    this.emit({ type: "resuming" });
    for (const message of this.eventHistory.filter((m) => m.seq > lastSeq)) {
      this.emit({ type: "message", message });
    }
  }

  private async handleUserMessage(content: string): Promise<void> {
    this.abortStream();
    this.seq = 0;
    this.eventHistory = [];
    const abort = new AbortController();
    this.streamAbort = abort;
    const streamId = `demo_${Date.now().toString(36)}`;
    const script = selectDemoScript(content);

    try {
      await this.runScript(script, streamId, abort.signal);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("[demo-agent]", err);
      }
    } finally {
      if (this.streamAbort === abort) {
        this.streamAbort = null;
      }
    }
  }

  private async runScript(script: DemoScript, streamId: string, signal: AbortSignal): Promise<void> {
    let callOrdinal = 0;

    for (const event of script.events) {
      if (signal.aborted || !this.connected) return;

      switch (event.kind) {
        case "token":
          this.pushMessage({
            type: "TOKEN",
            seq: this.nextSeq(),
            text: event.text,
            stream_id: streamId,
          });
          await delay(TOKEN_DELAY_MS, signal);
          break;
        case "context":
          this.pushMessage({
            type: "CONTEXT_SNAPSHOT",
            seq: this.nextSeq(),
            context_id: event.context_id,
            data: event.data,
          });
          break;
        case "tool_call": {
          const callId = `demo_tc_${callOrdinal++}`;
          this.pushMessage({
            type: "TOOL_CALL",
            seq: this.nextSeq(),
            call_id: callId,
            tool_name: event.tool_name,
            args: event.args,
            stream_id: streamId,
          });
          await this.waitForAck(callId);
          await delay(TOOL_RESULT_DELAY_MS, signal);
          if (signal.aborted || !this.connected) return;
          this.pushMessage({
            type: "TOOL_RESULT",
            seq: this.nextSeq(),
            call_id: callId,
            result: event.result,
            stream_id: streamId,
          });
          break;
        }
        default: {
          const _exhaustive: never = event;
          return _exhaustive;
        }
      }
    }

    if (signal.aborted || !this.connected) return;
    this.pushMessage({ type: "STREAM_END", seq: this.nextSeq(), stream_id: streamId });
  }

  private waitForAck(callId: string): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(callId);
        resolve();
      }, ACK_TIMEOUT_MS);
      this.pendingAcks.set(callId, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.connected) return;
      const challenge = `demo_${Date.now().toString(36)}`;
      this.pushMessage({ type: "PING", seq: this.nextSeq(), challenge });
      this.emit({ type: "pong_sent", pongEcho: challenge });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private abortStream(): void {
    this.streamAbort?.abort();
    this.streamAbort = null;
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private pushMessage(message: ServerMessage): void {
    this.eventHistory.push(message);
    this.emit({ type: "message", message });
  }

  private emit(event: WsEvent): void {
    this.handler?.(event);
  }
}
