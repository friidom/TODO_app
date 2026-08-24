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
  bare = false,
}: {
  value: string | null;
  onChange: (value: WorkType) => void;
  /** The create form has room for the word; the card does not. */
  showLabel?: boolean;
  /**
   * The tinted background off, leaving a coloured icon.
   *
   * **For the list, where the type is the quietest thing in the row.** A card is
   * a surface with room for a chip; a list row is a line of text, and a filled
   * badge at the start of it competes with the summary it is supposed to be
   * labelling. The colour still carries the type — it is the box around it that
   * the row does not need.
   */
  bare?: boolean;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

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
          "flex shrink-0 items-center gap-1 rounded transition-colors",
          bare
            ? cn("hover:bg-ink/10 p-0.5", meta.tone)
            : cn("text-mini px-1.5 py-0.5 font-semibold", meta.chip),
        )}
      >
        <Icon className={bare ? "size-4" : "size-3"} />
        {showLabel && current}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Work type"
            className="border-hairline bg-elevated rounded-card z-50 w-44 overflow-hidden border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <p className="text-ink-3 text-mini px-2 py-1.5 font-semibold tracking-wide uppercase">
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
                  className="text-ink hover:bg-ink/10 focus-visible:bg-ink/10 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none"
                >
                  <OptionIcon
                    className={cn("size-4 shrink-0", optionMeta.tone)}
                  />
                  <span className="flex-1 text-left">{option}</span>
                  {selected && (
                    <CheckIcon className="text-brand size-4 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
