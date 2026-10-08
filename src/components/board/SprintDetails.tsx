import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import { IterationCcwIcon, TargetIcon } from "lucide-react";

import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import IconButton from "@/components/ui/IconButton";
import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import { daysLeft } from "@/services/sprints/insights";
import type { Sprint } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDayFull, todayISO } from "@/utils/dueDate";

// The quick look: which sprint, and its dates. Progress and burndown live in the Insights drawer beside it.
export default function SprintDetails({ sprint }: { sprint: Sprint }) {
  const { t } = useTranslation();
  const { mounted, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-end",
  });

  const left = daysLeft(sprint.end_date, todayISO());

  return (
    <>
      <IconButton
        label={t("sprint.details")}
        size="toolbar"
        aria-haspopup="dialog"
        {...triggerProps}
        className="border-ink/15 hover:bg-wash-strong size-8 rounded-md bg-transparent"
      >
        <IterationCcwIcon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("sprint.details")}
            className={cn(POPOVER_PANEL, "shadow-e3 z-50 w-72 p-0")}
          >
            <div className="space-y-2 px-4 pt-3.5 pb-3">
              <div className="flex items-start gap-2">
                <p className="text-ink min-w-0 flex-1 text-sm font-semibold break-words">
                  {sprint.name}
                </p>

                <span className="bg-status-green/15 text-status-green text-micro mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase">
                  {t("sprint.active")}
                </span>
              </div>

              {left !== null && (
                <p
                  className={cn(
                    "text-meta font-medium tabular-nums",
                    left < 0 ? "text-status-red" : "text-brand",
                  )}
                >
                  {left < 0
                    ? t("sprint.daysOverdue", { count: Math.abs(left) })
                    : left === 0
                      ? t("sprint.endsToday")
                      : t("sprint.daysLeft", { count: left })}
                </p>
              )}

              {sprint.goal && (
                <p className="text-ink-2 text-meta flex gap-1.5 leading-relaxed">
                  <TargetIcon className="text-ink-3 mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{sprint.goal}</span>
                </p>
              )}
            </div>

            <dl className="border-hairline text-meta grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t px-4 py-3">
              <dt className="text-ink-3">{t("fields.startDate")}</dt>
              <dd className="text-ink text-right tabular-nums">
                {sprint.start_date ? formatDayFull(sprint.start_date) : "—"}
              </dd>

              <dt className="text-ink-3">{t("sprint.endDate")}</dt>
              <dd className="text-ink text-right tabular-nums">
                {sprint.end_date ? formatDayFull(sprint.end_date) : "—"}
              </dd>
            </dl>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
