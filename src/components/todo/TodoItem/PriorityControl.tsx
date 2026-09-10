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

export default function PriorityControl({
  value,
  onChange,
  showLabel = false,
  bare = false,
  alwaysVisible = false,
}: {
  value: string | null;
  onChange: (value: Priority | null) => void;
  showLabel?: boolean;
  // tinted background off, just the coloured arrow — used by the list, which needs the least visual weight
  bare?: boolean;
  // keeps the empty-state placeholder visible even without row hover — for surfaces like the card with no row to hover
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
          // "colors" isn't a real CSS property — spelled out, or only opacity actually transitions
          "flex shrink-0 items-center gap-1 rounded transition-[color,background-color,opacity] duration-150",
          bare
            ? cn(
                "hover:bg-ink/10 p-0.5",
                meta ? meta.tone : "text-ink-3/40 hover:text-ink-3",
              )
            : cn(
                "text-mini px-1.5 py-0.5 font-semibold",
                meta ? meta.chip : "bg-ink/10 text-ink-3 hover:text-ink-2",
              ),
          // opacity, not display — keeps the row from reflowing under the cursor
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
            className="border-hairline bg-elevated rounded-card z-50 w-44 overflow-hidden border p-1 shadow-e2"
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
