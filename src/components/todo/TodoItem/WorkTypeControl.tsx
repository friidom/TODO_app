import { CheckIcon } from "lucide-react";
import { FloatingPortal, type Placement } from "@floating-ui/react";

import { MENU_LABEL, POPOVER_PANEL } from "@/components/ui/controlChrome";
import {
  WORK_TYPE_OPTIONS,
  type WorkType,
  toWorkType,
  workTypeOf,
} from "@/constants/workTypes";
import { cn } from "@/utils/cn";
import { FIELD_CHIP, FIELD_ICON, OPTION_ITEM } from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

// controlled, like the other card popovers — reports the chosen type and never writes itself
export default function WorkTypeControl({
  value,
  onChange,
  showLabel = false,
  bare = false,
  placement,
}: {
  value: string | null;
  onChange: (value: WorkType) => void;
  showLabel?: boolean;
  // no tinted background, just the coloured icon — for the list row, where a filled badge is too loud
  bare?: boolean;
  placement?: Placement;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover({
    placement,
  });

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
        className={
          bare
            ? cn(FIELD_ICON, meta.tone)
            : cn(FIELD_CHIP, "shrink-0", meta.chip)
        }
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
            className={cn(POPOVER_PANEL, "z-50 w-44")}
          >
            <p className={MENU_LABEL}>Work type</p>

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
                  className={OPTION_ITEM}
                >
                  <OptionIcon className={cn("size-4", optionMeta.tone)} />
                  <span className="flex-1">{option}</span>
                  {selected && <CheckIcon className="text-brand size-4" />}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
