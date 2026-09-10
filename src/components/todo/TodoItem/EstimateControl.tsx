import { CheckIcon, XIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";
import { useState } from "react";

import { useCardPopover } from "./useCardPopover";
import {
  estimateAlwaysVisible,
  estimateToDraft,
  formatEstimate,
  parseEstimateDraft,
} from "@/services/todos/estimateInput";
import { cn } from "@/utils/cn";

export default function EstimateControl({
  value,
  onChange,
  alwaysVisible = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  // For a surface with no card row to hover, like the Details rail.
  alwaysVisible?: boolean;
}) {
  const { close, triggerProps, panelProps, mounted } = useCardPopover();
  const [draft, setDraft] = useState(() => estimateToDraft(value));

  const parsed = parseEstimateDraft(draft);
  const invalid = parsed === undefined;

  function commit() {
    if (parsed === undefined) return;

    onChange(parsed);
    close();
  }

  function cancel() {
    setDraft(estimateToDraft(value));
    close();
  }

  const label =
    value === null
      ? "Set a story point estimate"
      : `Story point estimate: ${value}`;

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        onClick={(event) => {
          // reseed from the live value on every open, not just mount — otherwise a reopen shows stale draft
          setDraft(estimateToDraft(value));
          triggerProps.onClick(event);
        }}
        title={label}
        aria-label={label}
        className={cn(
          "text-micro grid size-6 shrink-0 place-items-center rounded-sm font-semibold transition-[opacity,background-color]",
          estimateAlwaysVisible(value, alwaysVisible)
            ? "bg-ink/10 text-ink-2 hover:bg-ink/15"
            : cn(
                "border-hairline text-ink-3 hover:text-ink-2 border",
                "pointer-events-none opacity-0",
                "group-hover:pointer-events-auto group-hover:opacity-100",
                "focus-visible:pointer-events-auto focus-visible:opacity-100",
                "coarse:pointer-events-auto coarse:opacity-100",
              ),
        )}
      >
        {formatEstimate(value)}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Story point estimate"
            className="border-hairline bg-elevated rounded-card z-50 flex items-center gap-1 border p-1.5 shadow-e2"
          >
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // stop dnd-kit's listeners on the card root from treating Enter/Space as "pick this up"
                e.stopPropagation();

                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Story points"
              aria-invalid={invalid}
              className={cn(
                "text-meta rounded-control border-hairline bg-surface text-ink h-7 w-14 border px-1.5 text-center outline-none",
                "focus-visible:border-brand",
                invalid && "border-status-red",
              )}
            />

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={commit}
              disabled={invalid}
              aria-label="Save estimate"
              className="text-ink-2 hover:bg-ink/10 hover:text-ink rounded-control grid size-6 shrink-0 place-items-center transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckIcon size={13} />
            </button>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={cancel}
              aria-label="Cancel"
              className="text-ink-2 hover:bg-ink/10 hover:text-ink rounded-control grid size-6 shrink-0 place-items-center transition-colors"
            >
              <XIcon size={13} />
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
