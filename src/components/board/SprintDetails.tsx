import { FloatingPortal } from "@floating-ui/react";
import { CalendarRangeIcon, GaugeIcon, TargetIcon } from "lucide-react";

import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import IconButton from "@/components/ui/IconButton";
import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import { sprintPoints } from "@/services/todos/sprintPoints";
import { useTodos } from "@/services/todos/useTodos";
import { useStatuses } from "@/services/workflow/useWorkflow";
import type { Sprint } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDue, todayISO } from "@/utils/dueDate";

export default function SprintDetails({ sprint }: { sprint: Sprint }) {
  const { mounted, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-end",
  });

  const { data: todos = [] } = useTodos();
  const { data: statuses = [] } = useStatuses();

  const items = todos.filter((todo) => todo.sprint_id === sprint.id);
  const points = sprintPoints(items, statuses);

  const category = new Map(
    statuses.map((status) => [status.id, status.category]),
  );

  let done = 0;
  let working = 0;

  for (const item of items) {
    const of =
      item.status_id === null ? undefined : category.get(item.status_id);

    if (of === "done") done += 1;
    else if (of === "in_progress" || of === "in_review") working += 1;
  }

  const todo = items.length - done - working;
  const complete =
    items.length === 0 ? 0 : Math.round((done / items.length) * 100);
  const today = todayISO();
  const left = daysLeft(sprint.end_date, today);

  return (
    <>
      <IconButton
        label="Sprint details"
        size="toolbar"
        {...triggerProps}
        className="border-ink/15 hover:bg-wash-strong size-8 rounded-md bg-transparent"
      >
        <GaugeIcon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Sprint details"
            className={cn(POPOVER_PANEL, "z-50 w-72 p-0")}
          >
            <div className="border-hairline border-b px-3 py-2.5">
              <div className="flex items-start gap-2">
                <p className="text-ink text-meta min-w-0 flex-1 font-semibold">
                  {sprint.name}
                </p>

                <span className="bg-status-green/15 text-status-green text-micro shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase">
                  Active
                </span>
              </div>

              {sprint.goal && (
                <p className="text-ink-2 text-mini mt-1.5 flex gap-1.5 leading-relaxed">
                  <TargetIcon className="text-ink-3 mt-0.5 size-3.5 shrink-0" />
                  <span>{sprint.goal}</span>
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 px-3 py-2.5">
              <div className="text-ink-2 text-mini flex items-center gap-1.5">
                <CalendarRangeIcon className="text-ink-3 size-3.5 shrink-0" />

                <span>
                  {sprint.start_date || sprint.end_date
                    ? `${
                        sprint.start_date
                          ? formatDue(sprint.start_date, today)
                          : "?"
                      } – ${
                        sprint.end_date
                          ? formatDue(sprint.end_date, today)
                          : "?"
                      }`
                    : "No dates set"}
                </span>

                {left !== null && (
                  <span
                    className={cn(
                      "ml-auto font-medium tabular-nums",
                      left < 0 ? "text-status-red" : "text-ink-3",
                    )}
                  >
                    {left < 0
                      ? `${Math.abs(left)}d overdue`
                      : left === 0
                        ? "ends today"
                        : `${left}d left`}
                  </span>
                )}
              </div>

              <div>
                <div className="text-ink-2 text-mini mb-1 flex items-baseline justify-between">
                  <span>
                    {done} of {items.length} done
                  </span>

                  <span className="text-ink-3 tabular-nums">{complete}%</span>
                </div>

                <div
                  role="progressbar"
                  aria-valuenow={complete}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Sprint progress"
                  className="bg-wash-strong h-1.5 overflow-hidden rounded-full"
                >
                  <div
                    style={{ width: `${complete}%` }}
                    className="bg-status-green h-full rounded-full transition-[width] duration-300"
                  />
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat label="To do" value={todo} />
                <Stat label="In progress" value={working} />
                <Stat label="Done" value={done} />
              </dl>

              <dl className="border-hairline grid grid-cols-3 gap-2 border-t pt-2.5 text-center">
                <Stat label="Points" value={points.total} />
                <Stat label="Completed" value={points.completed} />
                <Stat label="Unestimated" value={points.unestimated} />
              </dl>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-ink text-meta font-semibold tabular-nums">{value}</dd>
      <dt className="text-ink-3 text-micro">{label}</dt>
    </div>
  );
}

// Whole days between the two calendar dates, so "ends today" is 0 rather than a
// rounding artefact of the clock time in either value.
function daysLeft(end: string | null, today: string): number | null {
  if (!end) return null;

  const ms =
    Date.parse(`${end.slice(0, 10)}T00:00:00Z`) -
    Date.parse(`${today.slice(0, 10)}T00:00:00Z`);

  return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
}
