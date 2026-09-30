import { useTranslation } from "react-i18next";
import { CheckIcon, XIcon } from "lucide-react";
import { FloatingPortal, type Placement } from "@floating-ui/react";
import { useState } from "react";

import IconButton from "@/components/ui/IconButton";
import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import {
  estimateAlwaysVisible,
  estimateToDraft,
  formatEstimate,
  parseEstimateDraft,
} from "@/services/todos/estimateInput";
import { cn } from "@/utils/cn";
import {
  FIELD_CELL,
  FIELD_CHIP,
  FIELD_EMPTY,
  HOVER_REVEAL,
} from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

export default function EstimateControl({
  value,
  onChange,
  alwaysVisible = false,
  showLabel = false,
  placement,
  variant,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  // For a surface with no card row to hover, like the Details rail.
  alwaysVisible?: boolean;
  // "3 points" / "None" as text, for a labelled field row rather than a dense card footer
  showLabel?: boolean;
  placement?: Placement;
  variant?: "cell";
}) {
  const { close, triggerProps, panelProps, mounted } = useCardPopover({
    placement,
  });
  const [draft, setDraft] = useState(() => estimateToDraft(value));
  const { t } = useTranslation();

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
    value === null ? t("estimate.set") : t("estimate.current", { value });

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
          variant === "cell"
            ? cn(FIELD_CELL, "tabular-nums", value === null && "text-ink-3")
            : showLabel
              ? cn(
                  "text-meta hover:bg-wash-strong focus-visible:ring-brand rounded-control -mx-1.5 flex h-7 shrink-0 items-center px-1.5 transition-colors outline-none focus-visible:ring-2",
                  value === null ? "text-ink-3" : "text-ink",
                )
              : cn(
                  FIELD_CHIP,
                  "min-w-5 shrink-0 justify-center px-1 font-semibold tabular-nums",
                  value === null
                    ? FIELD_EMPTY
                    : "bg-wash-strong text-ink-2 hover:bg-ink/15 hover:text-ink",
                  !estimateAlwaysVisible(value, alwaysVisible) && HOVER_REVEAL,
                ),
        )}
      >
        {variant === "cell"
          ? value === null
            ? t("common.none")
            : formatEstimate(value)
          : showLabel
            ? value === null
              ? t("common.none")
              : t("estimate.points", {
                  count: value,
                  value: formatEstimate(value),
                })
            : formatEstimate(value)}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("estimate.label")}
            className={cn(POPOVER_PANEL, "z-50 flex items-center gap-1 p-1.5")}
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
              aria-label={t("task.storyPoints")}
              aria-invalid={invalid}
              className={cn(
                "text-meta rounded-control border-hairline bg-surface text-ink h-7 w-14 border px-1.5 text-center outline-none",
                "focus-visible:border-brand focus-visible:ring-brand/30 focus-visible:ring-2",
                invalid && "border-status-red focus-visible:border-status-red",
              )}
            />

            <IconButton
              size="xs"
              tooltip={false}
              label={t("estimate.save")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={commit}
              disabled={invalid}
            >
              <CheckIcon />
            </IconButton>

            <IconButton
              size="xs"
              tooltip={false}
              label={t("common.cancel")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={cancel}
            >
              <XIcon />
            </IconButton>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
