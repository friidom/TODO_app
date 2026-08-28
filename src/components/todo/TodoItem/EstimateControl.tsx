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

/**
 * The card's story point estimate (M24-B): a small circle, a dash when
 * unset, a number when set, editable in place through the same popover
 * plumbing `DueDateControl` and `AssigneeControl` already use.
 *
 * **Unset follows `AssigneeControl` and `DueDateControl`'s own rule after
 * all**, revised from M24-B's first pass: hidden until the card is hovered
 * or the control gains keyboard focus, so a board with no estimates stays
 * as free of chrome as one with no assignees. A set value stays on screen
 * unconditionally — once a card has been sized, that is a fact about it
 * worth seeing without reaching for it.
 *
 * `pointer-events-none` while hidden matches the same two controls: an
 * invisible trigger must not still catch the click meant for the card
 * underneath it. `focus-visible:opacity-100` is what keeps it from relying
 * on hover alone — a keyboard user tabs onto the same hidden button a mouse
 * would have to hover to reveal, and `coarse:opacity-100` covers touch,
 * which has no hover state to reveal it with at all.
 *
 * **Controlled, like every sibling control.** It reports the parsed value
 * through `onChange` and never writes; `TodoCard` renders it directly
 * (not a node passed down from `TodoItem`) for the same reason it renders
 * `DueDateControl` directly — an estimate needs no board-scoped fetch, so
 * there is nothing `TodoItem` has to build for it. `TodoItem` still owns
 * the write: `onChange` reaches `useTodoPatch` → `updateTodo`, the same
 * mutation and the same `["todos", boardId]` cache write every other field
 * on the card already goes through.
 *
 * The parsing itself lives in `estimateInput.ts`, not here, for the reason
 * every `*.test.ts` sibling in this codebase exists: this project does not
 * unit-test components directly, so the negative-input guard and the
 * empty-is-null guard have to live somewhere a test can reach them.
 */
export default function EstimateControl({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
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
          // Seeded from the live value on every open, not just at mount —
          // the same reason `cancel` below resets it: a popover that was
          // opened, closed and reopened must show what is actually stored,
          // not whatever was left over from the last time it was open.
          setDraft(estimateToDraft(value));
          triggerProps.onClick(event);
        }}
        title={label}
        aria-label={label}
        className={cn(
          "text-micro grid size-6 shrink-0 place-items-center rounded-sm font-semibold transition-[opacity,background-color]",
          estimateAlwaysVisible(value)
            ? "bg-ink/10 text-ink-2 hover:bg-ink/15"
            : cn(
                "border-hairline text-ink-3 hover:text-ink-2 border",
                // Hidden until the card is hovered or this button itself is
                // focused — the same bargain `DueDateControl` and
                // `AssigneeControl` strike for their own unset state.
                "pointer-events-none opacity-0",
                "group-hover:pointer-events-auto group-hover:opacity-100",
                // Keyboard and touch do not hover, so both get their own way
                // in: a tabbed-to button reveals itself, and a coarse pointer
                // (no hover state to speak of) sees it every time.
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
                // The field owns the keyboard while it is open, the same
                // guard the title's rename input carries — the card root
                // spreads @dnd-kit's listeners, which treat Enter and Space
                // as "pick this card up".
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
