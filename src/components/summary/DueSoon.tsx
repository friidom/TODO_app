import { CalendarCheckIcon } from "lucide-react";

import { workTypeOf } from "@/constants/workTypes";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import type { DueSoonItem } from "@/services/views/summary";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { taskKey } from "@/utils/taskKey";
import SummaryCard from "./SummaryCard";

/**
 * What is late and what is next (M18).
 *
 * **The only widget on this page that names individual work items**, and that
 * is what earns it a place: every other card answers "how much", and none of
 * them answers the question somebody opening a board on Monday actually has,
 * which is "what do I have to deal with today". A count of six overdue items is
 * a fact; the six titles are the thing you act on.
 *
 * **"Overdue" is not defined here.** `dueSoonItems` calls `dueStatus()` — the
 * same function the card chip, the `due` filter and the metric strip call — so
 * a task this widget calls late is late everywhere else too. The plan states
 * this as a rule: *a dashboard that disagrees with the board about which task
 * is late is worse than no dashboard.*
 *
 * Rows open the existing task modal through `useOpenTask`, the same `?task=`
 * search param the board and the list use, so a deep link from here carries the
 * Summary view it was found under.
 */
export default function DueSoon({
  items,
  windowDays,
}: {
  items: DueSoonItem[];
  windowDays: number;
}) {
  const { openTask } = useOpenTask();
  const keyPrefix = useKeyPrefix();

  const overdue = items.filter((item) => item.status === "overdue").length;

  return (
    <SummaryCard
      title="Due soon"
      hint={`Open work that is late or due in the next ${windowDays} days.`}
      action={
        overdue > 0 ? (
          <span className="text-status-red text-[11px] font-medium tabular-nums">
            {overdue} overdue
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
          <span className="bg-ink/[0.06] text-ink-3 mb-2 grid size-9 place-items-center rounded-full">
            <CalendarCheckIcon className="size-4" />
          </span>

          <p className="text-ink-2 text-xs">Nothing is due in this window.</p>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {items.map(({ todo, status }) => {
            const meta = workTypeOf(todo.type);
            const Icon = meta.icon;
            const key = taskKey(keyPrefix, todo.board_key);

            return (
              <li key={todo.id}>
                <button
                  type="button"
                  onClick={() => openTask(todo.id)}
                  className="hover:bg-ink/[0.05] focus-visible:ring-brand rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors outline-none focus-visible:ring-2"
                >
                  <Icon className={cn("size-3.5 shrink-0", meta.tone)} />

                  {/* Fixed width so the keys line up down the list and the
                      titles start on one edge — the same reason the list view's
                      key track is fixed. `tabular-nums` keeps KAN-9 and KAN-12
                      the same width. */}
                  <span className="text-ink-3 w-14 shrink-0 truncate text-[11px] font-medium tabular-nums">
                    {key ?? "—"}
                  </span>

                  <span className="text-ink min-w-0 flex-1 truncate text-[13px]">
                    {todo.title || (
                      <span className="text-ink-3/60">Untitled</span>
                    )}
                  </span>

                  {/* Red for late, amber for today, quiet for anything further
                      out. Three states rather than a red badge on everything:
                      a panel where every row is red is a panel nobody reads
                      past the first week. */}
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium tabular-nums",
                      status === "overdue" && "text-status-red",
                      status === "today" && "text-status-orange",
                      status === "upcoming" && "text-ink-3",
                    )}
                  >
                    {status === "today"
                      ? "Today"
                      : formatDue(todo.due_date as string)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SummaryCard>
  );
}
