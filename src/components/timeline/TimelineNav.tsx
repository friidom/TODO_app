import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns3Icon,
  RotateCcwIcon,
} from "lucide-react";

import { HEADER_CONTROL_ACTIVE } from "@/components/board/headerControl";
import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import IconButton from "@/components/ui/IconButton";
import {
  MENU_ITEM,
  MENU_LABEL,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import type { TimelineView } from "@/hooks/useTimelineView";
import { TIMELINE_SCALES, windowLabel } from "@/services/views/timeline";
import {
  DEFAULT_TIMELINE_COLUMNS,
  isTimelineColumnShown,
  withTimelineColumnShown,
  type TimelineColumnPrefs,
} from "@/services/views/timelineColumns";
import { cn } from "@/utils/cn";

const STEP =
  "text-ink-2 hover:text-ink hover:bg-ink/[0.06] focus-visible:ring-brand flex h-full items-center justify-center px-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent";

const STEP_LABELS = {
  weeks: ["calendar.previousWeek", "calendar.nextWeek"],
  months: ["dates.previousMonth", "dates.nextMonth"],
  quarters: ["timeline.previousQuarter", "timeline.nextQuarter"],
} as const;

export default function TimelineNav({
  view,
  ticks,
  locale,
  unscheduled,
  offWindow,
  columns,
  onColumns,
}: {
  view: TimelineView;
  ticks: string[];
  locale?: string;
  unscheduled: number;
  offWindow: number;
  columns: TimelineColumnPrefs;
  onColumns: (
    change: (prefs: TimelineColumnPrefs) => TimelineColumnPrefs,
  ) => void;
}) {
  const { t } = useTranslation();
  const [previous, next] = STEP_LABELS[view.scale];

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="border-hairline bg-surface rounded-control flex h-8 shrink-0 items-center overflow-hidden border">
        <button
          type="button"
          onClick={() => view.step(-1)}
          aria-label={t(previous)}
          className={cn(STEP, "border-hairline border-r")}
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <button
          type="button"
          onClick={view.goToday}
          // disabled, not hidden — keeps the row width stable while paging
          disabled={view.isCurrent}
          className={cn(STEP, "px-2.5 text-xs font-medium")}
        >
          {t("time.today")}
        </button>

        <button
          type="button"
          onClick={() => view.step(1)}
          aria-label={t(next)}
          className={cn(STEP, "border-hairline border-l")}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <h2 className="text-ink min-w-0 text-sm font-semibold tracking-tight">
        {windowLabel(ticks, view.scale, locale)}
      </h2>

      {(unscheduled > 0 || offWindow > 0) && (
        <span className="text-ink-3 text-xs">
          {[
            offWindow > 0
              ? t("timeline.outsideRange", { count: offWindow })
              : null,
            unscheduled > 0
              ? t("timeline.undated", { count: unscheduled })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <ColumnsMenu columns={columns} onColumns={onColumns} />

        <div className="border-hairline bg-surface rounded-control flex h-8 shrink-0 items-center gap-0.5 border p-0.5">
          {TIMELINE_SCALES.map((scale) => {
            const selected = view.scale === scale;

            return (
              <button
                key={scale}
                type="button"
                onClick={() => view.setScale(scale)}
                aria-pressed={selected}
                className={cn(
                  "rounded-sm px-2.5 text-xs leading-6 capitalize transition-colors duration-150 outline-none",
                  "focus-visible:ring-brand focus-visible:ring-2",
                  selected
                    ? HEADER_CONTROL_ACTIVE
                    : "text-ink-3 hover:text-ink hover:bg-ink/[0.06]",
                )}
              >
                {t(`timeline.scale.${scale}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColumnsMenu({
  columns,
  onColumns,
}: {
  columns: TimelineColumnPrefs;
  onColumns: (
    change: (prefs: TimelineColumnPrefs) => TimelineColumnPrefs,
  ) => void;
}) {
  const { t } = useTranslation();
  const { open, mounted, close, triggerProps, panelProps } = useCardPopover();

  const customised =
    columns.hidden.length > 0 || Object.keys(columns.widths).length > 0;

  const optional = [
    { id: "status", label: t("fields.status") },
    { id: "assignee", label: t("fields.assignee") },
  ] as const;

  return (
    <>
      <IconButton
        {...triggerProps}
        size="sm"
        label={t("timeline.columns")}
        active={customised}
        aria-expanded={open}
        aria-haspopup="menu"
        className="hidden md:inline-grid"
      >
        <Columns3Icon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("timeline.columns")}
            className={cn(POPOVER_PANEL, "z-50 w-52")}
          >
            <p className={MENU_LABEL}>{t("timeline.columns")}</p>

            {optional.map(({ id, label }) => {
              const shown = isTimelineColumnShown(columns, id);

              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={shown}
                  onClick={() =>
                    onColumns((prefs) =>
                      withTimelineColumnShown(prefs, id, !shown),
                    )
                  }
                  className={MENU_ITEM}
                >
                  <span className="grid size-4 place-items-center">
                    {shown && <CheckIcon className="text-brand size-3.5" />}
                  </span>
                  {label}
                </button>
              );
            })}

            <div className={MENU_SEPARATOR} />

            <button
              type="button"
              role="menuitem"
              disabled={!customised}
              onClick={() => {
                onColumns(() => DEFAULT_TIMELINE_COLUMNS);
                close();
              }}
              className={MENU_ITEM}
            >
              <RotateCcwIcon />
              {t("timeline.resetColumns")}
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
