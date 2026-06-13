"use client";

import { useState, type ReactNode } from "react";

export function SidebarPanel({
  trace,
  context,
}: {
  trace: ReactNode;
  context: ReactNode;
}) {
  const [tab, setTab] = useState<"trace" | "context">("trace");

  return (
    <div className="sidebarPanel">
      <div className="sidebarTabs" role="tablist" aria-label="Inspector panels">
        <button
          type="button"
          role="tab"
          id="tab-trace"
          aria-selected={tab === "trace"}
          aria-controls="panel-trace"
          className={tab === "trace" ? "sidebarTab sidebarTabActive" : "sidebarTab"}
          onClick={() => setTab("trace")}
        >
          Trace
        </button>
        <button
          type="button"
          role="tab"
          id="tab-context"
          aria-selected={tab === "context"}
          aria-controls="panel-context"
          className={tab === "context" ? "sidebarTab sidebarTabActive" : "sidebarTab"}
          onClick={() => setTab("context")}
        >
          Context
        </button>
      </div>
      <div
        id="panel-trace"
        role="tabpanel"
        aria-labelledby="tab-trace"
        hidden={tab !== "trace"}
        className="sidebarTabPanel"
      >
        {trace}
      </div>
      <div
        id="panel-context"
        role="tabpanel"
        aria-labelledby="tab-context"
        hidden={tab !== "context"}
        className="sidebarTabPanel"
      >
        {context}
      </div>
    </div>
  );
}
