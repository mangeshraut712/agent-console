import { REPLAY_DISCLAIMER } from "@/agent/constants";
import { parseInvestigationContent } from "@/agent/parseRequest";
import { ProtocolEncoder } from "@/agent/protocol";
import { runReplay } from "@/agent/replay";
import type { AgentStep } from "@/agent/types";
import { abortableDelay } from "./abortableDelay";
import { parseServerMessage } from "./parseMessage";
import type { ClientMessage, ServerMessage } from "./types";
import type { WsEvent, WsEventHandler } from "./websocketManager";

const TOKEN_DELAY_MS = 24;
const ACK_TIMEOUT_MS = 5000;

/**
 * Speaks the agent-console protocol for Incident Desk.
 * Static demo builds replay in the browser. A Next.js server streams /api/investigate.
 */
export class DeskAgentManager {
  private handler: WsEventHandler | null = null;
  private connected = false;
  private processedSeq = 0;
  private eventHistory: ServerMessage[] = [];
  private streamAbort: AbortController | null = null;
  private pendingAcks = new Map<string, () => void>();

  setHandler(handler: WsEventHandler): void {
    this.handler = handler;
  }

  connect(): void {
    if (this.connected) return;
    this.emit({ type: "connecting" });
    this.connected = true;
    this.emit({ type: "open" });
  }

  disconnect(): void {
    this.connected = false;
    this.abortStream();
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
        this.emit({ type: "resuming" });
        for (const message of this.eventHistory.filter((item) => item.seq > msg.last_seq)) {
          this.emit({ type: "message", message });
        }
        break;
      case "PONG":
        break;
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  }

  setProcessedSeq(seq: number): void {
    if (seq > this.processedSeq) this.processedSeq = seq;
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

  private async handleUserMessage(content: string): Promise<void> {
    this.abortStream();
    this.eventHistory = [];
    const abort = new AbortController();
    this.streamAbort = abort;
    try {
      if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        await this.playStaticDemo(content, abort.signal);
      } else {
        await this.playHttp(content, abort.signal);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.pushMessage({
        type: "ERROR",
        seq: 1,
        code: "DESK_FAILED",
        message: error instanceof Error ? error.message : "Investigation failed.",
      });
    } finally {
      if (this.streamAbort === abort) this.streamAbort = null;
    }
  }

  private async playStaticDemo(content: string, signal: AbortSignal): Promise<void> {
    const parsed = parseInvestigationContent(content);
    const encoder = new ProtocolEncoder();
    if (parsed.mode === "live") {
      this.pushMessage(
        encoder.encode({
          kind: "error",
          code: "MISSING_NEBIUS_API_KEY",
          message: `This static demo only plays the recorded trace. ${REPLAY_DISCLAIMER} Run the Next.js server with NEBIUS_API_KEY to call Nemotron.`,
        })[0]!,
      );
      this.pushMessage(encoder.end());
      return;
    }
    await this.playSteps(
      runReplay({ incidentId: parsed.incidentId, alert: parsed.alert, mode: "replay" }),
      encoder,
      signal,
    );
  }

  private async playSteps(
    steps: AsyncGenerator<AgentStep>,
    encoder: ProtocolEncoder,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const step of steps) {
      if (signal.aborted || !this.connected) return;
      for (const message of encoder.encode(step)) {
        this.pushMessage(message);
        if (message.type === "TOKEN") await abortableDelay(TOKEN_DELAY_MS, signal);
        if (message.type === "TOOL_CALL") await this.waitForAck(message.call_id);
      }
    }
    if (signal.aborted || !this.connected) return;
    this.pushMessage(encoder.end());
  }

  private async playHttp(content: string, signal: AbortSignal): Promise<void> {
    const response = await fetch("/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text();
      this.pushMessage({
        type: "ERROR",
        seq: 1,
        code: "DESK_HTTP",
        message: text.slice(0, 400) || `Investigation request failed (${response.status}).`,
      });
      this.pushMessage({ type: "STREAM_END", seq: 2, stream_id: "desk_error" });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted && this.connected) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (signal.aborted || !this.connected) return;
        if (!line.trim()) continue;
        await this.emitLine(line);
      }
    }
    const tail = buffer.trim();
    if (tail && this.connected && !signal.aborted) await this.emitLine(tail);
  }

  private async emitLine(line: string): Promise<void> {
    const message = parseServerMessage(line);
    if (!message) return;
    this.pushMessage(message);
    if (message.type === "TOOL_CALL") await this.waitForAck(message.call_id);
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

  private abortStream(): void {
    this.streamAbort?.abort();
    this.streamAbort = null;
  }

  private pushMessage(message: ServerMessage): void {
    this.eventHistory.push(message);
    this.emit({ type: "message", message });
  }

  private emit(event: WsEvent): void {
    this.handler?.(event);
  }
}
