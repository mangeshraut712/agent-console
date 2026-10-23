"use client";

import { useMemo } from "react";
import { scoreInvestigation } from "@/agent/eval";
import type { Verdict } from "@/agent/types";

export function EvalPanel({
  incidentId,
  toolNames,
  services,
  verdict,
  narrative,
  ready,
}: {
  incidentId: string | null;
  toolNames: string[];
  services: string[];
  verdict: Partial<Verdict> | null;
  narrative: string;
  ready: boolean;
}) {
  const report = useMemo(() => {
    if (!incidentId || !ready) return null;
    return scoreInvestigation({ incidentId, toolNames, services, verdict, narrative });
  }, [incidentId, narrative, ready, services, toolNames, verdict]);

  return (
    <article className="card panelCard evalCard">
      <header className="cardHeader">
        <h2>Scorecard</h2>
        <span className="muted">
          {report ? `${report.passed}/${report.total} checks` : "Waiting for a finished run"}
        </span>
      </header>
      {!report && (
        <p className="muted">
          After the investigation finishes, these checks compare the trace with the seeded incident:
          required tools, cause, evidence ids, a concrete action, catalog services, and a bounded
          number of tool calls.
        </p>
      )}
      {report && (
        <ul className="evalList">
          {report.checks.map((check) => (
            <li key={check.id} className={check.pass ? "evalRow evalPass" : "evalRow evalFail"}>
              <span className="evalMark">{check.pass ? "Pass" : "Fail"}</span>
              <span>
                <strong>{check.title}</strong>
                <span className="evalDetail">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
