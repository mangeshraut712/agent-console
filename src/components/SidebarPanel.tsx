"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export function SidebarPanel({
  trace,
  context,
  score,
}: {
  trace: ReactNode;
  context: ReactNode;
  score?: ReactNode;
}) {
  const tabs = (score ? ["trace", "context", "score"] : ["trace", "context"]) as Array<
    "trace" | "context" | "score"
  >;
  const [tab, setTab] = useState<(typeof tabs)[number]>("trace");
  const tabRefs = useRef<Partial<Record<(typeof tabs)[number], HTMLButtonElement>>>({});

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.indexOf(tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[next]!;
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="sidebarPanel">
      <div className="sidebarTabs" role="tablist" aria-label="Inspector panels" onKeyDown={onTabKeyDown}>
        <button
          type="button"
          role="tab"
          id="tab-trace"
          ref={(node) => {
            tabRefs.current.trace = node ?? undefined;
          }}
          tabIndex={tab === "trace" ? 0 : -1}
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
          ref={(node) => {
            tabRefs.current.context = node ?? undefined;
          }}
          tabIndex={tab === "context" ? 0 : -1}
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
            ref={(node) => {
              tabRefs.current.score = node ?? undefined;
            }}
            tabIndex={tab === "score" ? 0 : -1}
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
