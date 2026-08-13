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
}: {
  value: string | null;
  onChange: (value: Priority | null) => void;
  /** The list view has a column's worth of room; a chip on a card does not. */
  showLabel?: boolean;
}) {
  const { open, close, triggerProps, panelProps } = useCardPopover();

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
          "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
          meta ? meta.chip : "bg-ink/10 text-ink-3 hover:text-ink-2",
        )}
      >
        <Icon className="size-3" />
        {showLabel && label}
      </button>

      {open && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Priority"
            className="border-hairline bg-elevated rounded-card z-50 w-44 overflow-hidden border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <p className="text-ink-3 px-2 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
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
