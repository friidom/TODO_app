import { CheckIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import {
  WORK_TYPE_OPTIONS,
  type WorkType,
  toWorkType,
  workTypeOf,
} from "@/constants/workTypes";
import { cn } from "@/utils/cn";

/**
 * The card's work type: a compact coloured chip that opens a four-item menu.
 *
 * Controlled, like `DueDateControl` and `AssigneeControl` — it reports the
 * chosen type through `onChange` and never writes. That is what lets the card
 * and the create form share one implementation: on a card the parent patches
 * through `updateTodo`, and in the create form the parent holds it in state
 * until the card is submitted.
 *
 * The chip is icon-only on the card. The label would double the width of the
 * densest row on the board for something the colour and icon already say, and
 * it is on the trigger's `aria-label` and `title` for anyone who needs it.
 */
export default function WorkTypeControl({
  value,
  onChange,
  showLabel = false,
}: {
  value: string | null;
  onChange: (value: WorkType) => void;
  /** The create form has room for the word; the card does not. */
  showLabel?: boolean;
}) {
  const { open, close, triggerProps, panelProps } = useCardPopover();

  const current = toWorkType(value);
  const meta = workTypeOf(current);
  const Icon = meta.icon;

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={`Work type: ${current}`}
        aria-label={`Work type: ${current}`}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
          meta.chip,
        )}
      >
        <Icon className="size-3" />
        {showLabel && current}
      </button>

      {open && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Work type"
            className="border-hairline bg-elevated z-50 w-44 overflow-hidden rounded-card border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <p className="text-ink-3 px-2 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
              Work type
            </p>

            {WORK_TYPE_OPTIONS.map((option) => {
              const optionMeta = workTypeOf(option);
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
                  className="text-ink hover:bg-ink/10 focus-visible:bg-ink/10 flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-sm transition-colors outline-none"
                >
                  <OptionIcon className={cn("size-4 shrink-0", optionMeta.tone)} />
                  <span className="flex-1 text-left">{option}</span>
                  {selected && <CheckIcon className="text-brand size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
