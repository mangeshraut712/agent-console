"use client";

import type { Verdict } from "@/agent/types";

export function VerdictCard({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return null;
  return (
    <article className="card verdictCard">
      <header className="cardHeader">
        <h2>Verdict</h2>
        <span className="verdictMeta">
          {verdict.severity} · {verdict.confidence} confidence
        </span>
      </header>
      <p className="verdictSummary">{verdict.summary}</p>
      <dl className="verdictList">
        <div>
          <dt>Likely cause</dt>
          <dd>{verdict.likely_cause}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{verdict.recommended_action}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{verdict.evidence_ids.join(", ")}</dd>
        </div>
      </dl>
    </article>
  );
}
