"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_NEBIUS_BASE_URL, DEFAULT_NEMOTRON_MODEL, NEBIUS_PROVIDER } from "@/agent/constants";
import { INCIDENTS, type Incident } from "@/agent/incidents";
import type { Verdict } from "@/agent/types";
import { DESK_ENDPOINT } from "@/lib/config";
import { useAgentConsole } from "@/lib/useAgentConsole";
import type { ContextSnapshotEntry, TraceEvent } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { ContextInspector } from "./ContextInspector";
import { EvalPanel } from "./EvalPanel";
import { PlannerCard } from "./PlannerCard";
import { TraceTimeline } from "./TraceTimeline";
import { SidebarPanel } from "./SidebarPanel";
import { VerdictCard } from "./VerdictCard";

interface DeskHealth {
  nebiusConfigured: boolean;
  tavilyConfigured: boolean;
  model: string;
  baseUrl: string;
  provider: string;
}

const STATIC_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function IncidentDesk({ onOpenConsole }: { onOpenConsole: () => void }) {
  const {
    connection,
    messages,
    traceEvents,
    contextSnapshots,
    sendMessage,
    connect,
    disconnect,
    clearSession,
    exportTraceJson,
    highlightEvent,
    highlightedEventId,
    sendToolAck,
    lastError,
    dismissError,
  } = useAgentConsole(DESK_ENDPOINT);

  const [health, setHealth] = useState<DeskHealth | null>(null);
  const [runMode, setRunMode] = useState<"replay" | "live">("replay");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (STATIC_DEMO) return;
    let cancelled = false;
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: DeskHealth | null) => {
        if (!cancelled && body) setHealth(body);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveReady = Boolean(health?.nebiusConfigured) && !STATIC_DEMO;
  const model = health?.model ?? DEFAULT_NEMOTRON_MODEL;
  const baseUrl = health?.baseUrl ?? DEFAULT_NEBIUS_BASE_URL;
  const connected = connection.status === "connected" || connection.status === "resuming";

  const incidentSnap = latestSnapshot(contextSnapshots, "incident");
  const plannerSnap = latestSnapshot(contextSnapshots, "planner");
  const verdictSnap = latestSnapshot(contextSnapshots, "verdict");
  const runSnap = latestSnapshot(contextSnapshots, "run");
  const runModeActual = stringField(incidentSnap?.data.mode);
  const verdict = asVerdict(verdictSnap?.data ?? null);
  const narrative = [...messages].reverse().find((message) => message.role === "assistant")?.text ?? "";
  const toolNames = useMemo(
    () =>
      traceEvents.flatMap((event) =>
        event.type === "TOOL_CALL" && typeof event.data.tool_name === "string" ? [event.data.tool_name] : [],
      ),
    [traceEvents],
  );
  const services = useMemo(() => traceEvents.flatMap(serviceFromEvent), [traceEvents]);

  const investigate = (incident: Incident) => {
    setActiveId(incident.id);
    clearSession();
    sendMessage(`incident:${incident.id}\nmode:${runMode}\n${incident.alert}`);
  };

  const exportTrace = () => {
    const blob = new Blob([exportTraceJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incident-trace-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const scorecard = (
    <EvalPanel
      incidentId={stringField(runSnap?.data.incident_id) || activeId}
      toolNames={toolNames}
      services={services}
      verdict={verdict}
      narrative={narrative}
      ready={runSnap !== null}
    />
  );

  return (
    <main className="shell">
      <section className="hero card">
        <div>
          <p className="eyebrow">Northwind on-call · {NEBIUS_PROVIDER}</p>
          <h1>Incident Desk</h1>
          <p className="lede">
            An operator pastes a page, and NVIDIA Nemotron plans the investigation: which service to
            open, which logs to search, when to check the public web. The trace, the tool cards, and
            the scorecard stay on screen so you can see whether the conclusion is backed by evidence.
          </p>
          <p className="modelLine">
            <code>{model}</code>
            <span> via {baseUrl}/chat/completions</span>
          </p>
        </div>
        <div className="deskStatus">
          <p className={connected ? "statusPill statusPillOk" : "statusPill"}>
            {connected ? "Desk connected" : connection.status === "disconnected" ? "Disconnected" : "Connecting"}
          </p>
          <button type="button" className="toolbarBtn" onClick={onOpenConsole}>
            Protocol console
          </button>
        </div>
      </section>

      <section className="card deskControls">
        <div className="modeSwitch" role="radiogroup" aria-label="Investigation source">
          <label className={runMode === "replay" ? "modeOption modeOptionOn" : "modeOption"}>
            <input
              type="radio"
              name="run-mode"
              value="replay"
              checked={runMode === "replay"}
              onChange={() => setRunMode("replay")}
            />
            Replay
          </label>
          <label
            className={runMode === "live" ? "modeOption modeOptionOn" : "modeOption"}
            title={liveReady ? "Call Nemotron through Nebius Token Factory" : "Needs NEBIUS_API_KEY on the server"}
          >
            <input
              type="radio"
              name="run-mode"
              value="live"
              checked={runMode === "live"}
              disabled={!liveReady}
              onChange={() => setRunMode("live")}
            />
            Live Nemotron
          </label>
        </div>
        <p className="muted deskHelp">
          {liveReady
            ? "Live calls Nemotron with the server key. Telemetry is still the Northwind seed. Tavily runs only when TAVILY_API_KEY is set."
            : "Replay is a recorded trace with seeded tool results. Nemotron is not called. Set NEBIUS_API_KEY on the server to enable Live."}
          {health?.tavilyConfigured ? " Tavily is configured." : " Tavily is not configured."}
        </p>
      </section>

      {runModeActual === "replay" && (
        <div className="replayBanner" role="status">
          Replay. This trace was recorded for the demo. Nemotron was not called.
        </div>
      )}
      {runModeActual === "live" && (
        <div className="liveBanner" role="status">
          Live. {model} is planning through {NEBIUS_PROVIDER}. Service health and logs are the Northwind seed.
        </div>
      )}
      {lastError && (
        <div className="errorBanner" role="alert">
          <span>{lastError}</span>
          <button type="button" className="errorBannerDismiss" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}

      <section className="incidentGrid">
        {INCIDENTS.map((incident) => (
          <button
            key={incident.id}
            type="button"
            className={activeId === incident.id ? "card incidentCard incidentCardOn" : "card incidentCard"}
            disabled={!connected}
            onClick={() => investigate(incident)}
          >
            <span className="incidentSeverity">{incident.severity}</span>
            <strong>{incident.title}</strong>
            <span className="muted">{incident.blurb}</span>
          </button>
        ))}
      </section>

      <section className="toolbar card">
        <p className="muted deskToolbarNote">
          Pick an incident above, or describe a checkout, login, or queue alert.
        </p>
        <div className="toolbarActions">
          <button type="button" className="toolbarBtn" onClick={exportTrace} disabled={traceEvents.length === 0}>
            Export trace
          </button>
        </div>
      </section>

      <section className="grid">
        <div className="deskMain">
          <PlannerCard
            step={typeof plannerSnap?.data.step === "number" ? plannerSnap.data.step : null}
            reasoning={stringField(plannerSnap?.data.reasoning)}
            disclaimer={stringField(plannerSnap?.data.disclaimer) || null}
            model={runModeActual === "live" ? stringField(plannerSnap?.data.model) : null}
          />
          <VerdictCard verdict={verdict} />
          <ChatPanel
            messages={messages}
            onSendMessage={(text) => {
              clearSession();
              setActiveId(null);
              sendMessage(`mode:${runMode}\n${text}`);
            }}
            onAckToolCall={sendToolAck}
            onHighlightEvent={highlightEvent}
            highlightedEventId={highlightedEventId}
            connectionStatus={connection.status}
            emptyHint="Pick a seeded incident. Replay runs with no API key and is labeled on screen."
            placeholder={connected ? "Describe a checkout, login, or queue alert…" : "Connecting the desk…"}
          />
        </div>
        <aside className="sidebar">
          <div className="sidebarDesktop">
            {scorecard}
            <TraceTimeline
              events={traceEvents}
              onHighlightEvent={highlightEvent}
              highlightedEventId={highlightedEventId}
            />
            <ContextInspector snapshots={contextSnapshots} />
          </div>
          <div className="sidebarMobile">
            <SidebarPanel
              score={scorecard}
              trace={
                <TraceTimeline
                  events={traceEvents}
                  onHighlightEvent={highlightEvent}
                  highlightedEventId={highlightedEventId}
                />
              }
              context={<ContextInspector snapshots={contextSnapshots} />}
            />
          </div>
        </aside>
      </section>
    </main>
  );
}

function latestSnapshot(snapshots: ContextSnapshotEntry[], id: string): ContextSnapshotEntry | null {
  const matches = snapshots.filter((snapshot) => snapshot.context_id === id);
  return matches[matches.length - 1] ?? null;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function serviceFromEvent(event: TraceEvent): string[] {
  if (event.type !== "TOOL_CALL") return [];
  const args = event.data.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  const service = (args as Record<string, unknown>).service;
  return typeof service === "string" ? [service] : [];
}

function asVerdict(data: Record<string, unknown> | null): Verdict | null {
  if (!data) return null;
  const severity = data.severity;
  const confidence = data.confidence;
  if (
    (severity !== "sev1" && severity !== "sev2" && severity !== "sev3") ||
    (confidence !== "high" && confidence !== "medium" && confidence !== "low") ||
    typeof data.likely_cause !== "string" ||
    typeof data.recommended_action !== "string" ||
    typeof data.summary !== "string" ||
    !Array.isArray(data.evidence_ids)
  ) {
    return null;
  }
  return {
    severity,
    confidence,
    likely_cause: data.likely_cause,
    recommended_action: data.recommended_action,
    summary: data.summary,
    evidence_ids: data.evidence_ids.filter((id): id is string => typeof id === "string"),
  };
}
