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

// controlled, like the other card popovers — reports the chosen type and never writes itself
export default function WorkTypeControl({
  value,
  onChange,
  showLabel = false,
  bare = false,
}: {
  value: string | null;
  onChange: (value: WorkType) => void;
  showLabel?: boolean;
  // no tinted background, just the coloured icon — for the list row, where a filled badge is too loud
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
          "flex shrink-0 items-center gap-1 rounded transition-colors duration-150",
          bare
            ? cn("hover:bg-ink/10 p-0.5", meta.tone)
            : cn("text-mini px-1.5 py-0.5 font-semibold", meta.chip),
        )}
      >
        <Icon className={bare ? "size-3.5" : "size-3"} />
        {showLabel && current}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Work type"
            className="border-hairline bg-elevated rounded-card z-50 w-44 overflow-hidden border p-1 shadow-e2"
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
