"use client";

import { useAgentConsole } from "@/lib/useAgentConsole";
import { ConnectionSettings } from "./ConnectionSettings";
import { ChatPanel } from "./ChatPanel";
import { TraceTimeline } from "./TraceTimeline";
import { ContextInspector } from "./ContextInspector";
import { QuickPrompts } from "./QuickPrompts";

export function AgentConsole() {
  const {
    connection,
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
  } = useAgentConsole();

  const isConnected =
    connection.status === "connected" || connection.status === "resuming";

  const handleExportTrace = () => {
    const json = exportTraceJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-trace-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="shell">
      <section className="hero card">
        <div>
          <p className="eyebrow">Open source · WebSocket agent UI</p>
          <h1>Agent Console</h1>
          <p className="lede">
            Debug and demo any agent backend that speaks the{" "}
            <a href="https://github.com/mangeshraut712/agent-console/blob/main/docs/ADOPTING.md">
              Agent Console protocol
            </a>
            . Streaming tokens, tool calls, live trace, and context diffs — plug in your own{" "}
            <code>ws://</code> endpoint below.
          </p>
        </div>
        <ConnectionSettings
          status={connection.status}
          wsUrl={wsUrl}
          onWsUrlChange={updateWsUrl}
          onConnect={connect}
          onDisconnect={disconnect}
        />
      </section>

      {lastError && (
        <div className="errorBanner" role="alert">
          <span>{lastError}</span>
          <button type="button" className="errorBannerDismiss" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}

      <section className="toolbar card">
        <QuickPrompts onSelect={sendMessage} disabled={!isConnected} />
        <div className="toolbarActions">
          <button
            type="button"
            className="toolbarBtn"
            onClick={clearSession}
            disabled={messages.length === 0 && traceEvents.length === 0}
          >
            Clear session
          </button>
          <button
            type="button"
            className="toolbarBtn"
            onClick={handleExportTrace}
            disabled={traceEvents.length === 0}
          >
            Export trace
          </button>
          <a
            className="toolbarLink"
            href="https://github.com/mangeshraut712/agent-console"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </section>

      <section className="grid">
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          onAckToolCall={sendToolAck}
          onHighlightEvent={highlightEvent}
          highlightedEventId={highlightedEventId}
          connectionStatus={connection.status}
        />

        <aside className="sidebar">
          <TraceTimeline
            events={traceEvents}
            onHighlightEvent={highlightEvent}
            highlightedEventId={highlightedEventId}
          />

          <ContextInspector snapshots={contextSnapshots} />
        </aside>
      </section>
    </main>
  );
}
