"use client";

export function PlannerCard({
  step,
  reasoning,
  disclaimer,
  model,
}: {
  step: number | null;
  reasoning: string;
  disclaimer: string | null;
  model: string | null;
}) {
  if (!reasoning) return null;
  return (
    <article className="card plannerCard">
      <header className="cardHeader">
        <h2>Planner</h2>
        <span className="muted">{step ? `Step ${step}` : "Latest step"}</span>
      </header>
      {disclaimer && <p className="plannerDisclaimer">{disclaimer}</p>}
      {model && <p className="muted plannerModel">{model}</p>}
      <p className="plannerText">{reasoning}</p>
    </article>
  );
}
