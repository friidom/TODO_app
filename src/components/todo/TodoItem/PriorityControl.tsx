import { useTranslation } from "react-i18next";
import { CheckIcon, MinusIcon, SignalIcon } from "lucide-react";
import { FloatingPortal, type Placement } from "@floating-ui/react";

import {
  PRIORITIES,
  PRIORITY_OPTIONS,
  priorityOf,
  toPriority,
  type Priority,
} from "@/constants/priorities";
import {
  MENU_LABEL,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { cn } from "@/utils/cn";
import {
  FIELD_CELL,
  FIELD_CHIP,
  FIELD_EMPTY,
  FIELD_ICON,
  HOVER_REVEAL,
  OPTION_ITEM,
} from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

export default function PriorityControl({
  value,
  onChange,
  showLabel = false,
  bare = false,
  alwaysVisible = false,
  placement,
  variant,
}: {
  value: string | null;
  onChange: (value: Priority | null) => void;
  showLabel?: boolean;
  // tinted background off, just the coloured arrow — used by the list, which needs the least visual weight
  bare?: boolean;
  // keeps the empty-state placeholder visible even without row hover — for surfaces with no row to hover, like the detail rail
  alwaysVisible?: boolean;
  placement?: Placement;
  variant?: "cell";
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover({
    placement,
  });

  const { t } = useTranslation();
  const current = toPriority(value);
  const meta = priorityOf(current);
  const Icon = meta?.icon ?? SignalIcon;
  const label = meta?.label ?? t("priority.none");
  const cell = variant === "cell";

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={t("priority.labelled", { name: label })}
        aria-label={t("priority.labelled", { name: label })}
        className={cn(
          cell
            ? cn(FIELD_CELL, !meta && "text-ink-3")
            : bare
              ? cn(FIELD_ICON, meta ? meta.tone : FIELD_EMPTY)
              : cn(FIELD_CHIP, "shrink-0", meta ? meta.chip : FIELD_EMPTY),
          // opacity, not display — keeps the row from reflowing under the cursor
          !cell && !meta && !alwaysVisible && HOVER_REVEAL,
        )}
      >
        {cell ? (
          <>
            {meta && <Icon className={cn("size-4 shrink-0", meta.tone)} />}
            <span className="truncate">
              {meta ? meta.label : t("common.none")}
            </span>
          </>
        ) : (
          <>
            <Icon className={bare ? "size-3.5" : "size-3"} />
            {showLabel && label}
          </>
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("fields.priority")}
            className={cn(POPOVER_PANEL, "z-50 w-44")}
          >
            <p className={MENU_LABEL}>{t("fields.priority")}</p>

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
                  className={OPTION_ITEM}
                >
                  <OptionIcon className={cn("size-4", optionMeta.tone)} />
                  <span className="flex-1">{optionMeta.label}</span>
                  {selected && <CheckIcon className="text-brand size-4" />}
                </button>
              );
            })}

            <div className={MENU_SEPARATOR} />

            <button
              type="button"
              role="menuitemradio"
              aria-checked={current === null}
              onClick={() => {
                onChange(null);
                close();
              }}
              className={cn(OPTION_ITEM, "text-ink-2")}
            >
              <MinusIcon className="text-ink-3 size-4" />
              <span className="flex-1">{t("priority.none")}</span>
              {current === null && <CheckIcon className="text-brand size-4" />}
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
