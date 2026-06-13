"use client";

/** Example prompts — matches agent-server trigger keywords (see agent-server/README.md). */
export const QUICK_PROMPTS = [
  { label: "Hello", message: "Hello there!" },
  { label: "Q3 report", message: "Summarise the Q3 report" },
  { label: "Analyze", message: "Analyze and compare the data" },
  { label: "Lookup", message: "Search the knowledge base for revenue" },
  { label: "Large context", message: "Show me the database schema" },
  { label: "Long doc", message: "Write a detailed document about our product" },
] as const;

export function QuickPrompts({
  onSelect,
  disabled,
}: {
  onSelect: (message: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="quickPrompts">
      <span className="quickPromptsLabel">Try:</span>
      <div className="quickPromptsList">
        {QUICK_PROMPTS.map(({ label, message }) => (
          <button
            key={label}
            type="button"
            className="quickPromptChip"
            disabled={disabled}
            onClick={() => onSelect(message)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
