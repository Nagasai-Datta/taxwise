"use client";

export type Mode = "text" | "interactive";

/**
 * Objective 2 made visible.
 *
 * Both renderings come from the same tool result, so switching cannot change
 * a figure. The switch is per answer, not a global setting, because the right
 * mode depends on the question: a definition wants prose, a comparison wants
 * a component.
 */
export default function ModeToggle({
  mode, onChange, disabled,
}: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-amber" role="group">
      {(["text", "interactive"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          disabled={disabled}
          aria-pressed={mode === m}
          className={
            "px-2.5 py-[3px] text-[10px] font-bold transition " +
            (mode === m ? "bg-amber text-white" : "text-amber hover:bg-amber/10") +
            (disabled ? " opacity-40" : "")
          }
        >
          {m === "text" ? "Text" : "Interactive"}
        </button>
      ))}
    </div>
  );
}
