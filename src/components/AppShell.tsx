"use client";

import { useState } from "react";
import { AgentConsole } from "./AgentConsole";
import { IncidentDesk } from "./IncidentDesk";

export function AppShell() {
  const [view, setView] = useState<"desk" | "console">("desk");

  if (view === "console") {
    return (
      <>
        <div className="shell viewSwitchBar">
          <button type="button" className="toolbarBtn" onClick={() => setView("desk")}>
            Back to Incident Desk
          </button>
          <span className="muted">Protocol console for any WebSocket agent backend.</span>
        </div>
        <AgentConsole />
      </>
    );
  }

  return <IncidentDesk onOpenConsole={() => setView("console")} />;
}
