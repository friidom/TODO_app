import { Fragment, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import type { BacklogIndicator } from "@/hooks/useBacklogDnd";
import type { SprintSection as SprintSectionData } from "@/services/todos/backlog";
import { sprintPoints } from "@/services/todos/sprintPoints";
import { usePermissions } from "@/hooks/usePermissions";
import { useAddBacklogItem } from "@/services/todos/useAddBacklogItem";
import { useStartSprint } from "@/services/sprints/useSprints";
import type { IColumn, Sprint } from "@/types/data";
import { formatDue, todayISO } from "@/utils/dueDate";
import { cn } from "@/utils/cn";
import BacklogDropZone from "./BacklogDropZone";
import BacklogRow from "./BacklogRow";

/**
 * One Sprint's own section of the Backlog view (M30): its compact "Sprint
 * Details" header — name, dates, goal, state, item count, Story Point
 * totals — and the work items planned into it.
 *
 * **The header is the Sprint Details view.** A separate modal would repeat
 * every one of these fields for no reason: the header already has to show
 * them for the page to be useful at all, so this section *is* the detail
 * view rather than a summary that opens a longer one.
 *
 * **Gap-precise drop targets (M31-C).** Each row sits between two
 * always-mounted `BacklogDropZone`s — the same "N rows, N+1 gaps" shape
 * `KanbanColumn.tsx` gives the Board — so a drag can land exactly between
 * two specific items, not merely "somewhere in this section". This
 * section's own `useDroppable` is the coarse "which section is the pointer
 * over" target `useBacklogDnd`'s collision detection resolves first, and
 * doubles as the drop target when the section is empty (no gaps to be
 * nearest to) — the same fallback `KanbanColumn`'s own container gives an
 * empty column. Ordering within a section is `backlog_rank`, one of two
 * fractional-rank fields a card carries — its own, separate from the
 * Board's `rank` — and is now drag-reorderable (`registry.ts`'s
 * `canReorder: true` for this view).
 */
export default function SprintSection({
  section,
  sprints,
  columns,
  indicator,
  onEdit,
  onComplete,
  onDelete,
}: {
  section: SprintSectionData;
  /** Every open sprint on the board — threaded down to each row's own
   * `SprintControl`, so moving an item here into a different sprint does
   * not need a second query. */
  sprints: Sprint[];
  columns: IColumn[];
  /** The page's current drop target, or null when nothing is being
   * dragged — read only for the gaps whose `sectionKey` names this Sprint,
   * the same way `KanbanColumn` reads the Board's shared `indicator`. */
  indicator: BacklogIndicator | null;
  onEdit: (sprint: Sprint) => void;
  onComplete: (sprint: Sprint) => void;
  onDelete: (sprint: Sprint) => void;
}) {
  const { sprint, items } = section;
  const { canEditTodos } = usePermissions();

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const startSprint = useStartSprint();
  const addItem = useAddBacklogItem();

  const { setNodeRef, isOver } = useDroppable({
    id: `backlog-section:${sprint.id}`,
    data: { type: "backlog-section", sectionKey: sprint.id },
  });

  const points = sprintPoints(items, columns);
  const today = todayISO();

  function submitNewItem() {
    const trimmed = title.trim();

    if (trimmed) addItem.mutate({ title: trimmed, sprintId: sprint.id });

    setTitle("");
    setAdding(false);
  }

  return (
    <section className="border-hairline rounded-card mb-4 overflow-hidden border">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((open) => !open)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${sprint.name}`}
          className="text-ink-3 hover:text-ink hover:bg-ink/10 mt-0.5 grid size-5 shrink-0 place-items-center rounded transition-colors"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-ink truncate text-sm font-semibold">
              {sprint.name}
            </h3>

            {sprint.state === "active" && (
              <span className="bg-status-green/15 text-status-green text-micro shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase">
                Active
              </span>
            )}

            {canEditTodos && (
              <button
                type="button"
                onClick={() => onEdit(sprint)}
                aria-label="Edit sprint"
                title="Edit sprint"
                className="text-ink-3 hover:text-ink hover:bg-ink/10 grid size-5 shrink-0 place-items-center rounded transition-colors"
              >
                <PencilIcon className="size-3" />
              </button>
            )}

            {/* Future sprints only. An active sprint's exit is "Complete
                sprint" — it decides where unfinished work goes and keeps the
                record of what shipped, which deleting would throw away — and
                a completed one has no section here at all
                (`buildBacklogBoard` filters it out). Same lifecycle shape
                `start_sprint`/`complete_sprint` already enforce. */}
            {canEditTodos && sprint.state === "future" && (
              <button
                type="button"
                onClick={() => onDelete(sprint)}
                aria-label="Delete sprint"
                title="Delete sprint"
                className="text-ink-3 hover:text-status-red hover:bg-status-red/10 grid size-5 shrink-0 place-items-center rounded transition-colors"
              >
                <Trash2Icon className="size-3" />
              </button>
            )}
          </div>

          <p className="text-ink-3 text-mini mt-0.5 flex flex-wrap items-center gap-x-2">
            {(sprint.start_date || sprint.end_date) && (
              <span>
                {sprint.start_date ? formatDue(sprint.start_date, today) : "?"}
                {" – "}
                {sprint.end_date ? formatDue(sprint.end_date, today) : "?"}
              </span>
            )}

            <span>
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>

            {sprint.goal && (
              <span className="min-w-0 truncate italic" title={sprint.goal}>
                “{sprint.goal}”
              </span>
            )}
          </p>
        </div>

        {/* The Story Point totals sit here, beside the Sprint's own actions,
            not in the meta line above — the Jira reference's "22  0  123
            [Complete sprint]" cluster. Never gated on `canEditTodos`: a
            viewer reads these totals the same as an editor, only the
            actions beside them are edit-only. */}
        <div className="flex shrink-0 items-center gap-2.5">
          {points.total > 0 && (
            <span
              className="flex items-center gap-1.5 font-semibold tabular-nums"
              title={`${points.todo} To Do · ${points.inProgress} In Progress · ${points.done} Done — ${points.completed} of ${points.total} points done${points.unestimated ? `, ${points.unestimated} unestimated` : ""}`}
            >
              <span className="text-ink-3">{points.todo}</span>
              <span className="text-status-blue">{points.inProgress}</span>
              <span className="text-status-green">{points.done}</span>
            </span>
          )}

          {canEditTodos && sprint.state === "future" && (
            <button
              type="button"
              onClick={() => startSprint.mutate(sprint.id)}
              disabled={startSprint.isPending}
              className="border-hairline text-ink-2 hover:bg-ink/[0.06] rounded-control h-7 border px-2.5 text-xs font-medium transition-colors disabled:opacity-60"
            >
              {startSprint.isPending ? "Starting…" : "Start sprint"}
            </button>
          )}

          {canEditTodos && sprint.state === "active" && (
            <button
              type="button"
              onClick={() => onComplete(sprint)}
              className="border-hairline text-ink-2 hover:bg-ink/[0.06] rounded-control h-7 border px-2.5 text-xs font-medium transition-colors"
            >
              Complete sprint
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div
          ref={setNodeRef}
          className={cn(
            "border-hairline border-t transition-colors",
            isOver && "bg-brand/5",
          )}
        >
          {items.length > 0 && (
            <BacklogDropZone
              sectionKey={sprint.id}
              index={0}
              active={
                indicator?.sectionKey === sprint.id && indicator.index === 0
              }
              afterId={items[0]?.id}
            />
          )}

          {items.map((item, i) => (
            <Fragment key={item.id}>
              <BacklogRow todo={item} sprints={sprints} columns={columns} />

              <BacklogDropZone
                sectionKey={sprint.id}
                index={i + 1}
                active={
                  indicator?.sectionKey === sprint.id &&
                  indicator.index === i + 1
                }
                beforeId={item.id}
                afterId={items[i + 1]?.id}
              />
            </Fragment>
          ))}

          {canEditTodos &&
            (adding ? (
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNewItem();
                    if (e.key === "Escape") {
                      setTitle("");
                      setAdding(false);
                    }
                  }}
                  onBlur={submitNewItem}
                  placeholder="What needs doing?"
                  className="border-hairline text-ink placeholder:text-ink-3 focus:border-brand/60 focus:ring-brand/25 rounded-control min-w-0 flex-1 border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-2"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={cn(
                  "text-ink-3 hover:bg-ink/[0.035] hover:text-ink-2 flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium transition-colors",
                  items.length === 0 && "border-hairline/0",
                )}
              >
                <PlusIcon className="size-3.5" />
                Create item
              </button>
            ))}

          {items.length === 0 && !adding && (
            <p className="text-ink-3 px-3 pb-2 text-xs">
              Nothing planned into this sprint yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
