"use client";

import { useState, type ReactNode } from "react";

export function SidebarPanel({
  trace,
  context,
  score,
}: {
  trace: ReactNode;
  context: ReactNode;
  score?: ReactNode;
}) {
  const [tab, setTab] = useState<"trace" | "context" | "score">("trace");

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
        {score ? (
          <button
            type="button"
            role="tab"
            id="tab-score"
            aria-selected={tab === "score"}
            aria-controls="panel-score"
            className={tab === "score" ? "sidebarTab sidebarTabActive" : "sidebarTab"}
            onClick={() => setTab("score")}
          >
            Score
          </button>
        ) : null}
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
      {score ? (
        <div
          id="panel-score"
          role="tabpanel"
          aria-labelledby="tab-score"
          hidden={tab !== "score"}
          className="sidebarTabPanel"
        >
          {score}
        </div>
      ) : null}
    </div>
  );
}
