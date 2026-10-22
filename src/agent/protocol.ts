import type { ServerMessage } from "@/lib/types";
import type { AgentStep } from "./types";

export class ProtocolEncoder {
  private seq = 0;
  private calls = 0;
  readonly streamId: string;

  constructor(streamId?: string) {
    this.streamId = streamId ?? `s_${Math.random().toString(36).slice(2, 10)}`;
  }

  encode(step: AgentStep): ServerMessage[] {
    switch (step.kind) {
      case "context":
        return [
          {
            type: "CONTEXT_SNAPSHOT",
            seq: this.next(),
            context_id: step.contextId,
            data: step.data,
          },
        ];
      case "token":
        return [
          {
            type: "TOKEN",
            seq: this.next(),
            text: step.text,
            stream_id: this.streamId,
          },
        ];
      case "tool_call": {
        const callId = `tc_${this.calls}`;
        this.calls += 1;
        return [
          {
            type: "TOOL_CALL",
            seq: this.next(),
            call_id: callId,
            tool_name: step.toolName,
            args: step.args,
            stream_id: this.streamId,
          },
          {
            type: "TOOL_RESULT",
            seq: this.next(),
            call_id: callId,
            result: step.result,
            stream_id: this.streamId,
          },
        ];
      }
      case "error":
        return [
          {
            type: "ERROR",
            seq: this.next(),
            code: step.code,
            message: step.message,
          },
        ];
      default: {
        const _exhaustive: never = step;
        return _exhaustive;
      }
    }
  }

  end(): ServerMessage {
    return { type: "STREAM_END", seq: this.next(), stream_id: this.streamId };
  }

  private next(): number {
    this.seq += 1;
    return this.seq;
  }
}
