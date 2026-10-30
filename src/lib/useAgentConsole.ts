"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WebSocketManager } from "./websocketManager";
import { DemoAgentManager } from "./demoAgent";
import { DeskAgentManager } from "./deskAgent";
import { acceptOrderedMessages, ReorderBuffer } from "./reorderBuffer";
import { createFlushScheduler } from "./flushScheduler";
import { markToolAckSent, resetToolAckRegistry } from "./toolAckRegistry";
import {
  abandonUnconfirmedStream,
  completeActiveStream,
  type ActiveAssistantStream,
} from "./streamLifecycle";
import {
  getStoredWsUrl,
  setStoredWsUrl,
  isValidWsUrl,
  isDemoEndpoint,
  isDeskEndpoint,
  DEFAULT_WS_URL,
} from "./config";
import type {
  ServerMessage,
  ConversationMessage,
  TraceEvent,
  ContextSnapshotEntry,
  ToolCallWithResult,
  ConnectionStatus,
} from "./types";

function traceIdForSeq(turn: number, seq: number): string {
  return `evt_seq_${turn}_${seq}`;
}

export type ConnectionState = {
  status: ConnectionStatus;
};

export interface AgentConsoleState {
  connection: ConnectionState;
  wsUrl: string;
  lastError: string | null;
  messages: ConversationMessage[];
  traceEvents: TraceEvent[];
  contextSnapshots: ContextSnapshotEntry[];
}

export interface AgentConsoleActions {
  sendMessage: (content: string) => void;
  connect: () => void;
  disconnect: () => void;
  updateWsUrl: (url: string) => void;
  dismissError: () => void;
  clearSession: () => void;
  exportTraceJson: () => string;
  highlightEvent: (eventId: string) => void;
  highlightedEventId: string | null;
  sendToolAck: (callId: string) => void;
}

export function useAgentConsole(endpoint?: string): AgentConsoleState & AgentConsoleActions {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [wsUrl, setWsUrl] = useState(endpoint ?? DEFAULT_WS_URL);
  const [lastError, setLastError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [contextSnapshots, setContextSnapshots] = useState<ContextSnapshotEntry[]>([]);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  const messagesRef = useRef<ConversationMessage[]>([]);
  const traceEventsRef = useRef<TraceEvent[]>([]);
  const contextSnapshotsRef = useRef<ContextSnapshotEntry[]>([]);

  const turnRef = useRef(0);
  const pongCountRef = useRef(0);
  const wsRef = useRef<WebSocketManager | DemoAgentManager | DeskAgentManager | null>(null);
  const reorderBufRef = useRef<ReorderBuffer>(new ReorderBuffer());
  const processedSeqRef = useRef<number>(0);
  const isResumingRef = useRef(false);
  const resumeFallbackRef = useRef<number | null>(null);

  const clearResumeFallback = useCallback(() => {
    if (resumeFallbackRef.current !== null) {
      clearTimeout(resumeFallbackRef.current);
      resumeFallbackRef.current = null;
    }
  }, []);

  const currentStreamRef = useRef<ActiveAssistantStream | null>(null);

  const flushState = useCallback(() => {
    setMessages(messagesRef.current.slice());
    setTraceEvents(traceEventsRef.current.slice());
    setContextSnapshots(contextSnapshotsRef.current.slice());
  }, []);

  const flushSchedulerRef = useRef(createFlushScheduler(flushState));

  const scheduleFlush = useCallback(() => {
    flushSchedulerRef.current.schedule();
  }, []);

  const markProcessedSeq = useCallback((seq: number) => {
    if (seq > processedSeqRef.current) {
      processedSeqRef.current = seq;
      wsRef.current?.setProcessedSeq(seq);
    }
  }, []);

  const ensureAssistantStream = useCallback(
    (streamId: string): number | null => {
      const msgs = messagesRef.current;

      if (currentStreamRef.current?.streamId === streamId) {
        return currentStreamRef.current.messageIdx;
      }

      if (
        wsRef.current instanceof WebSocketManager &&
        !wsRef.current.markStreamActive(streamId)
      ) {
        return null;
      }

      const existingIdx = msgs.findIndex(
        (m) => m.role === "assistant" && m.streamId === streamId && m.isStreaming,
      );
      if (existingIdx >= 0) {
        currentStreamRef.current = { streamId, messageIdx: existingIdx };
        return existingIdx;
      }

      const newMsg: ConversationMessage = {
        id: `msg_${streamId}`,
        role: "assistant",
        text: "",
        toolCalls: [],
        streamId,
        isStreaming: true,
      };
      msgs.push(newMsg);
      const msgIdx = msgs.length - 1;
      currentStreamRef.current = { streamId, messageIdx: msgIdx };
      return msgIdx;
    },
    [],
  );

  const processToken = useCallback((msg: ServerMessage & { type: "TOKEN" }) => {
    const msgIdx = ensureAssistantStream(msg.stream_id);
    if (msgIdx === null) return;
    const msgs = messagesRef.current;
    msgs[msgIdx] = {
      ...msgs[msgIdx]!,
      text: msgs[msgIdx]!.text + msg.text,
    };
  }, [ensureAssistantStream]);

  const processToolCall = useCallback(
    (msg: ServerMessage & { type: "TOOL_CALL" }) => {
      const msgIdx = ensureAssistantStream(msg.stream_id);
      if (msgIdx === null) return;
      const msgs = messagesRef.current;
      const traceEventId = traceIdForSeq(turnRef.current, msg.seq);

      const tc: ToolCallWithResult = {
        call_id: msg.call_id,
        tool_name: msg.tool_name,
        args: msg.args,
        result: null,
        acknowledged: false,
        seq: msg.seq,
        traceEventId,
      };

      msgs[msgIdx] = {
        ...msgs[msgIdx]!,
        toolCalls: [...msgs[msgIdx]!.toolCalls, tc],
      };
    },
    [ensureAssistantStream],
  );

  const processToolResult = useCallback((msg: ServerMessage & { type: "TOOL_RESULT" }) => {
    const msgs = messagesRef.current;
    let msgIdx = currentStreamRef.current?.messageIdx ?? -1;

    if (msgIdx < 0) {
      msgIdx = msgs.findIndex(
        (m) =>
          m.role === "assistant" &&
          m.streamId === msg.stream_id &&
          m.toolCalls.some((tc) => tc.call_id === msg.call_id),
      );
    }

    if (msgIdx >= 0 && msgIdx < msgs.length) {
      const toolCalls = msgs[msgIdx]!.toolCalls.map((tc) =>
        tc.call_id === msg.call_id
          ? {
              ...tc,
              result: msg.result,
              acknowledged: true,
              resultTraceEventId: traceIdForSeq(turnRef.current, msg.seq),
            }
          : tc,
      );
      msgs[msgIdx] = { ...msgs[msgIdx]!, toolCalls };
    }
  }, []);

  const processContextSnapshot = useCallback((msg: ServerMessage & { type: "CONTEXT_SNAPSHOT" }) => {
    contextSnapshotsRef.current.push({
      context_id: msg.context_id,
      seq: msg.seq,
      data: msg.data,
      timestamp: Date.now(),
    });
  }, []);

  const processStreamEnd = useCallback((msg: ServerMessage & { type: "STREAM_END" }): boolean => {
    const activeStream = currentStreamRef.current;
    const manager = wsRef.current instanceof WebSocketManager ? wsRef.current : null;
    currentStreamRef.current = completeActiveStream(
      activeStream,
      msg.stream_id,
      messagesRef.current,
      manager,
    );
    return activeStream !== null && currentStreamRef.current === null;
  }, []);

  const finishResume = useCallback(() => {
    isResumingRef.current = false;
    clearResumeFallback();
    setStatus("connected");
  }, [clearResumeFallback]);

  const failResume = useCallback((message: string) => {
    currentStreamRef.current = abandonUnconfirmedStream(
      currentStreamRef.current,
      messagesRef.current,
    );
    if (wsRef.current instanceof WebSocketManager) {
      wsRef.current.abandonStream();
    }
    flushSchedulerRef.current.flushNow();
    setLastError(message);
    finishResume();
  }, [finishResume]);

  const appendTraceEvent = useCallback((event: TraceEvent) => {
    traceEventsRef.current.push(event);
  }, []);

  const processMessage = useCallback(
    (msg: ServerMessage) => {
      markProcessedSeq(msg.seq);
      let completedRecoveryStream = false;

      const traceEvent: TraceEvent = {
        id: traceIdForSeq(turnRef.current, msg.seq),
        seq: msg.seq,
        type: msg.type,
        timestamp: Date.now(),
        data: {},
        call_id: "call_id" in msg ? (msg as { call_id: string }).call_id : undefined,
      };

      for (const [key, val] of Object.entries(msg)) {
        if (key !== "type" && key !== "seq") {
          traceEvent.data[key] = val as unknown;
        }
      }

      appendTraceEvent(traceEvent);

      switch (msg.type) {
        case "TOKEN":
          processToken(msg);
          break;
        case "TOOL_CALL":
          processToolCall(msg);
          break;
        case "TOOL_RESULT":
          processToolResult(msg);
          break;
        case "CONTEXT_SNAPSHOT":
          processContextSnapshot(msg);
          break;
        case "STREAM_END":
          completedRecoveryStream = processStreamEnd(msg);
          break;
        case "PING":
          break;
        case "ERROR":
          if (isResumingRef.current) {
            failResume(`${msg.code}: ${msg.message}`);
          } else {
            setLastError(`${msg.code}: ${msg.message}`);
          }
          break;
        default: {
          const _exhaustive: never = msg;
          return _exhaustive;
        }
      }

      if (isResumingRef.current && completedRecoveryStream) {
        finishResume();
      }
    },
    [
      appendTraceEvent,
      markProcessedSeq,
      processContextSnapshot,
      processStreamEnd,
      processToken,
      processToolCall,
      processToolResult,
      failResume,
      finishResume,
    ],
  );

  const sendToolAck = useCallback((callId: string) => {
    if (!markToolAckSent(callId)) return;
    wsRef.current?.send({ type: "TOOL_ACK", call_id: callId });
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      const ws = wsRef.current;
      if (!ws?.isConnected()) return;

      turnRef.current += 1;
      reorderBufRef.current.reset(1);
      processedSeqRef.current = 0;
      ws.resetProcessedSeq();
      currentStreamRef.current = null;
      resetToolAckRegistry();

      const userMsg: ConversationMessage = {
        id: `msg_user_${Date.now()}`,
        role: "user",
        text: content,
        toolCalls: [],
        streamId: null,
        isStreaming: false,
      };
      messagesRef.current.push(userMsg);
      flushSchedulerRef.current.flushNow();

      ws.send({ type: "USER_MESSAGE", content });
    },
    [],
  );

  const connect = useCallback(() => {
    if (!isValidWsUrl(wsUrl)) {
      setLastError("Invalid endpoint — use ws://, wss://, demo://, or desk://");
      return;
    }

    setLastError(null);
    if (!isDeskEndpoint(wsUrl)) setStoredWsUrl(wsUrl);
    wsRef.current?.disconnect();

    const ws = isDeskEndpoint(wsUrl)
      ? new DeskAgentManager()
      : isDemoEndpoint(wsUrl)
        ? new DemoAgentManager()
        : new WebSocketManager(wsUrl);
    wsRef.current = ws;

    ws.setHandler((event) => {
      switch (event.type) {
        case "connecting":
          setStatus("connecting");
          break;
        case "open":
          if (ws.getProcessedSeq() === 0 && !isResumingRef.current) {
            setStatus("connected");
          }
          break;
        case "resuming":
          isResumingRef.current = true;
          setStatus("resuming");
          clearResumeFallback();
          resumeFallbackRef.current = window.setTimeout(() => {
            if (isResumingRef.current) {
              failResume("Stream recovery could not be confirmed. Retry the request.");
            }
          }, 3000);
          break;
        case "reconnecting":
          setStatus("reconnecting");
          break;
        case "close":
          setStatus("disconnected");
          break;
        case "pong_sent":
          appendTraceEvent({
            id: `pong_${turnRef.current}_${pongCountRef.current++}`,
            seq: -1,
            type: "PONG",
            timestamp: Date.now(),
            data: { echo: event.pongEcho ?? "" },
          });
          scheduleFlush();
          break;
        case "message":
          if (event.message) {
            const ordered = acceptOrderedMessages(reorderBufRef.current, event.message);
            for (const orderedMsg of ordered) {
              processMessage(orderedMsg);
            }
            scheduleFlush();
          }
          break;
        case "parse_error":
          setLastError("Received malformed JSON from server — check backend message format");
          break;
        case "error":
          setLastError("WebSocket connection error — check URL and that the server is running");
          break;
      }
    });

    ws.connect();
  }, [appendTraceEvent, clearResumeFallback, failResume, processMessage, scheduleFlush, wsUrl]);

  const updateWsUrl = useCallback((url: string) => {
    setWsUrl(url);
  }, []);

  const dismissError = useCallback(() => setLastError(null), []);

  const clearSession = useCallback(() => {
    messagesRef.current = [];
    traceEventsRef.current = [];
    contextSnapshotsRef.current = [];
    turnRef.current = 0;
    currentStreamRef.current = null;
    reorderBufRef.current.reset(1);
    processedSeqRef.current = 0;
    wsRef.current?.resetProcessedSeq();
    resetToolAckRegistry();
    flushSchedulerRef.current.flushNow();
  }, []);

  const exportTraceJson = useCallback(() => {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        connection: {
          status,
          wsUrl,
          processedSeq: processedSeqRef.current,
          reconnectAttempts: wsRef.current?.getReconnectAttempts() ?? 0,
        },
        events: traceEventsRef.current,
        messages: messagesRef.current,
        contextSnapshots: contextSnapshotsRef.current,
      },
      null,
      2,
    );
  }, [status, wsUrl]);

  const disconnect = useCallback(() => {
    flushSchedulerRef.current.cancel();
    wsRef.current?.disconnect();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const highlightEvent = useCallback((eventId: string) => {
    setHighlightedEventId(eventId);
    window.setTimeout(() => setHighlightedEventId(null), 1500);
  }, []);

  useEffect(() => {
    if (endpoint) return;
    setWsUrl(getStoredWsUrl());
  }, [endpoint]);

  useEffect(() => {
    return () => {
      clearResumeFallback();
      flushSchedulerRef.current.cancel();
      wsRef.current?.disconnect();
    };
  }, [clearResumeFallback]);

  return {
    connection: { status },
    wsUrl,
    lastError,
    messages,
    traceEvents,
    contextSnapshots,
    sendMessage,
    connect,
    disconnect,
    updateWsUrl,
    dismissError,
    clearSession,
    exportTraceJson,
    highlightEvent,
    highlightedEventId,
    sendToolAck,
  };
}
