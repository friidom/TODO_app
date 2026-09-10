import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import type { DueSoonItem } from "@/services/views/summary";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { taskKey } from "@/utils/taskKey";
import SummaryCard, { WidgetEmpty } from "./SummaryCard";

// dueSoonItems calls the same dueStatus() as the card chip and the due filter, so "overdue" always means the same thing
export default function DueSoon({
  items,
  windowDays,
  className,
}: {
  items: DueSoonItem[];
  windowDays: number;
  className?: string;
}) {
  const { openTask } = useOpenTask();
  const keyPrefix = useKeyPrefix();

  const overdue = items.filter((item) => item.status === "overdue").length;

  return (
    <SummaryCard
      title="Due soon"
      className={className}
      action={
        overdue > 0 ? (
          <span className="text-status-red text-mini font-medium tabular-nums">
            {overdue} overdue
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        // The shared empty state rather than the illustrated one this widget
        // used to carry: a disc and two lines in ~130px of padding made a board
        // with no deadlines the most padded board there is.
        <WidgetEmpty>Nothing due in the next {windowDays} days.</WidgetEmpty>
      ) : (
        <ul className="px-1.5 pb-2">
          {items.map(({ todo, status }) => {
            const key = taskKey(keyPrefix, todo.board_key);

            return (
              <li key={todo.id}>
                <button
                  type="button"
                  onClick={() => openTask(todo.id)}
                  className="hover:bg-ink/[0.05] focus-visible:ring-brand rounded-control flex w-full items-center gap-2 px-2 py-1 text-left transition-colors outline-none focus-visible:ring-2"
                >
                  {/* Fixed width so the keys line up down the list and the
                      titles start on one edge — the same reason the list view's
                      key track is fixed. `tabular-nums` keeps KAN-9 and KAN-12
                      the same width. */}
                  <span className="text-ink-3 text-mini w-14 shrink-0 truncate font-medium tabular-nums">
                    {key ?? "—"}
                  </span>

                  <span className="text-ink text-meta min-w-0 flex-1 truncate">
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
                      "text-mini shrink-0 font-medium tabular-nums",
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
