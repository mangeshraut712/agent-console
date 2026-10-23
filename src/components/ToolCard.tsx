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

  const handleCopy = async (_event: React.MouseEvent, label: string, data: unknown) => {
    const ok = await copyText(JSON.stringify(data, null, 2));
    if (ok) {
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <div
      className={`toolCard ${hasResult ? "toolCardResult" : "toolCardPending"} ${isHighlighted ? "toolCardHighlighted" : ""}`}
    >
      <div className="toolCardHeader">
        <span className="toolCardIcon" aria-hidden="true">
          {hasResult ? "✓" : "⚡"}
        </span>
        <span className="toolCardName">{toolCall.tool_name}</span>
        <span className="toolCardStatus">{hasResult ? "Complete" : "Running…"}</span>
        <button
          type="button"
          className="toolCopyBtn"
          onClick={() => onHighlight?.(toolCall.traceEventId)}
          aria-label={`Show ${toolCall.tool_name} in the trace`}
        >
          Trace
        </button>
      </div>
      <div className="toolCardSection">
        <div className="toolCardSectionHead">
          <span className="toolCardLabel">Arguments</span>
          <button
            type="button"
            className="toolCopyBtn"
            aria-label={`Copy arguments for ${toolCall.tool_name}`}
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
              aria-label={`Copy result for ${toolCall.tool_name}`}
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
