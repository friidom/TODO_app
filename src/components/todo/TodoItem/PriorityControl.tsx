import { CheckIcon, MinusIcon, SignalIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import {
  PRIORITIES,
  PRIORITY_OPTIONS,
  priorityOf,
  toPriority,
  type Priority,
} from "@/constants/priorities";
import { cn } from "@/utils/cn";
import { useCardPopover } from "./useCardPopover";

/**
 * A card's priority: a compact chip that opens the five levels.
 *
 * Controlled, like `WorkTypeControl`, `DueDateControl` and `AssigneeControl` —
 * it reports the choice through `onChange` and never writes. The parent patches
 * through `useTodoPatch`, which is what lets the card menu and the list row
 * share this one implementation.
 *
 * **Unset is a first-class value, unlike work type.** `todos.type` is NOT NULL
 * with a default, so every card has one; `todos.priority` is nullable and most
 * cards have none. The chip renders as a neutral placeholder rather than as a
 * fake "Medium", and the menu offers "No priority" as a real option so a
 * priority set by mistake can be taken off again.
 */
export default function PriorityControl({
  value,
  onChange,
  showLabel = false,
  bare = false,
  alwaysVisible = false,
}: {
  value: string | null;
  onChange: (value: Priority | null) => void;
  /** The list view has a column's worth of room; a chip on a card does not. */
  showLabel?: boolean;
  /**
   * The tinted background off, leaving a coloured arrow.
   *
   * **The list wants the least of any field here.** Priority is one of five
   * levels drawn as an up or down arrow, which is legible at a glance from the
   * shape and the colour alone — the chip around it was carrying no information
   * the arrow was not already carrying.
   */
  bare?: boolean;
  /**
   * Keep the placeholder on screen when nothing is set.
   *
   * **Off by default, which is the change M18 made.** `SignalIcon` is what an
   * unset priority renders, and in a list where most cards have none it drew
   * the same meaningless glyph on every single row — a column of noise that
   * looked like data. Faded out, an empty priority costs nothing to look at and
   * the control is still one hover away, which is the same bargain
   * `AssigneeControl` and `DueDateControl` already struck.
   *
   * `alwaysVisible` is for a surface with no row to hover — the card, where the
   * control has to be findable without one.
   */
  alwaysVisible?: boolean;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  const current = toPriority(value);
  const meta = priorityOf(current);
  const Icon = meta?.icon ?? SignalIcon;
  const label = meta?.label ?? "No priority";

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={`Priority: ${label}`}
        aria-label={`Priority: ${label}`}
        className={cn(
          // `colors` is not a CSS property, so the old `transition-[colors,opacity]`
          // animated nothing but opacity — the one control on the card whose tint
          // snapped instead of easing. The property names are spelled out.
          "flex shrink-0 items-center gap-1 rounded transition-[color,background-color,opacity] duration-150",
          bare
            ? cn(
                "hover:bg-ink/10 p-0.5",
                // Unset is a real and common state, so it renders as something
                // rather than as a gap — but at a weight that does not read as a
                // priority of its own.
                meta ? meta.tone : "text-ink-3/40 hover:text-ink-3",
              )
            : cn(
                "text-mini px-1.5 py-0.5 font-semibold",
                meta ? meta.chip : "bg-ink/10 text-ink-3 hover:text-ink-2",
              ),
          // Opacity, never `display` — the button stays in flow at zero, so a
          // row does not reflow under the cursor and the grid track keeps its
          // width whether or not the card has a priority.
          !meta &&
            !alwaysVisible &&
            "coarse:opacity-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Icon className={bare ? "size-3.5" : "size-3"} />
        {showLabel && label}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Priority"
            className="border-hairline bg-elevated rounded-card z-50 w-44 overflow-hidden border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <p className="text-ink-3 text-mini px-2 py-1.5 font-semibold tracking-wide uppercase">
              Priority
            </p>

            {PRIORITY_OPTIONS.map((option) => {
              const optionMeta = PRIORITIES[option];
              const OptionIcon = optionMeta.icon;
              const selected = option === current;

              return (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onChange(option);
                    close();
                  }}
                  className="text-ink hover:bg-ink/10 focus-visible:bg-ink/10 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none"
                >
                  <OptionIcon
                    className={cn("size-4 shrink-0", optionMeta.tone)}
                  />
                  <span className="flex-1 text-left">{optionMeta.label}</span>
                  {selected && (
                    <CheckIcon className="text-brand size-4 shrink-0" />
                  )}
                </button>
              );
            })}

            <button
              type="button"
              role="menuitemradio"
              aria-checked={current === null}
              onClick={() => {
                onChange(null);
                close();
              }}
              className="text-ink-2 hover:bg-ink/10 focus-visible:bg-ink/10 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none"
            >
              <MinusIcon className="text-ink-3 size-4 shrink-0" />
              <span className="flex-1 text-left">No priority</span>
              {current === null && (
                <CheckIcon className="text-brand size-4 shrink-0" />
              )}
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
