"use client";

import type { ConnectionStatus } from "@/lib/types";
import { isValidWsUrl } from "@/lib/config";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  resuming: "Resuming…",
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: "#ef4444",
  connecting: "#f59e0b",
  connected: "#22c55e",
  reconnecting: "#f59e0b",
  resuming: "#3b82f6",
};

export function ConnectionSettings({
  status,
  wsUrl,
  onWsUrlChange,
  onConnect,
  onDisconnect,
}: {
  status: ConnectionStatus;
  wsUrl: string;
  onWsUrlChange: (url: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isLive =
    status === "connected" || status === "resuming" || status === "reconnecting";
  const isTransient = status === "connecting";
  const urlValid = isValidWsUrl(wsUrl);

  return (
    <div className="connectionSettings">
      <label className="connectionSettingsLabel" htmlFor="ws-url-input">
        Agent WebSocket URL
      </label>
      <div className="connectionSettingsRow">
        <input
          id="ws-url-input"
          type="url"
          className="connectionUrlInput"
          value={wsUrl}
          onChange={(e) => onWsUrlChange(e.target.value)}
          placeholder="ws://localhost:4747/ws"
          disabled={isLive || isTransient}
          spellCheck={false}
        />
        <div className="connectionIndicator connectionIndicatorInline">
          <span
            className="connectionDot"
            style={{ backgroundColor: STATUS_COLORS[status] }}
            title={STATUS_LABELS[status]}
          />
          <span className="connectionLabel">{STATUS_LABELS[status]}</span>
        </div>
        {isLive ? (
          <button type="button" className="connectionBtn" onClick={onDisconnect}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="connectionBtn connectionBtnConnect"
            onClick={onConnect}
            disabled={isTransient || !urlValid}
            title={!urlValid ? "Enter a valid ws:// or wss:// URL" : undefined}
          >
            {isTransient ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>
      {!urlValid && wsUrl.trim() !== "" && (
        <p className="connectionUrlHint">Use a WebSocket URL starting with <code>ws://</code> or <code>wss://</code></p>
      )}
    </div>
  );
}
