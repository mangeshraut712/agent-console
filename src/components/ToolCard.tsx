"use client";

import { useLayoutEffect, useState } from "react";
import type { ToolCallWithResult } from "@/lib/types";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ToolCard({
  toolCall,
  onAck,
  onHighlight,
  isHighlighted,
}: {
  toolCall: ToolCallWithResult;
  onAck: (callId: string) => void;
  onHighlight?: (traceEventId: string) => void;
  isHighlighted?: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  useLayoutEffect(() => {
    onAck(toolCall.call_id);
  }, [toolCall.call_id, onAck]);

  const hasResult = toolCall.result !== null;

  const handleCopy = async (e: React.MouseEvent, label: string, data: unknown) => {
    e.stopPropagation();
    const ok = await copyText(JSON.stringify(data, null, 2));
    if (ok) {
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <div
      className={`toolCard ${hasResult ? "toolCardResult" : "toolCardPending"} ${isHighlighted ? "toolCardHighlighted" : ""}`}
      onClick={() => onHighlight?.(toolCall.traceEventId)}
      role="button"
      tabIndex={0}
      aria-label={`Tool ${toolCall.tool_name}, ${hasResult ? "complete" : "running"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onHighlight?.(toolCall.traceEventId);
        }
      }}
    >
      <div className="toolCardHeader">
        <span className="toolCardIcon" aria-hidden="true">
          {hasResult ? "✓" : "⚡"}
        </span>
        <span className="toolCardName">{toolCall.tool_name}</span>
        <span className="toolCardStatus">{hasResult ? "Complete" : "Running…"}</span>
      </div>
      <div className="toolCardSection">
        <div className="toolCardSectionHead">
          <span className="toolCardLabel">Arguments</span>
          <button
            type="button"
            className="toolCopyBtn"
            onClick={(e) => handleCopy(e, "args", toolCall.args)}
          >
            {copied === "args" ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="toolCardCode">{JSON.stringify(toolCall.args, null, 2)}</pre>
      </div>
      {hasResult && (
        <div className="toolCardSection">
          <div className="toolCardSectionHead">
            <span className="toolCardLabel">Result</span>
            <button
              type="button"
              className="toolCopyBtn"
              onClick={(e) => handleCopy(e, "result", toolCall.result)}
            >
              {copied === "result" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="toolCardCode">{JSON.stringify(toolCall.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
