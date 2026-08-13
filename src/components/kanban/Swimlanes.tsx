import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import MemberIdentity from "@/components/members/MemberIdentity";
import { columnTitle } from "@/constants/columns";
import { PRIORITIES, type Priority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { GroupKey, TodoGroup } from "@/services/todos/view";
import { UNSET } from "@/services/todos/view";
import type { IColumn } from "@/types/data";
import { cn } from "@/utils/cn";
import KanbanColumn from "./KanbanColumn";

/**
 * The board split into lanes, one per group.
 *
 * **The columns stay statuses.** That is the whole design: a lane is a
 * horizontal slice of the same board, so "In progress" still means what it
 * always did and the board still reads as a board. The alternative — turning the
 * columns into assignees — would be a second Kanban with its own meaning for a
 * drop, and `KanbanColumn` renders both of these unchanged.
 *
 * Grouping by status is not routed here: the columns already are the statuses,
 * so that grouping is the board that was already on screen.
 *
 * Nothing drags in here. A drop would have to mean two things at once — move to
 * this column *and* take on this lane's assignee, type or priority — and
 * inventing an answer to that is worse than saying so, which `ViewNotice` does.
 */
export default function Swimlanes({
  groups,
  group,
  orderedColumns,
  members,
}: {
  groups: TodoGroup[];
  /** Which dimension the lanes are, so a lane can be decorated like one. */
  group: GroupKey;
  orderedColumns: IColumn[];
  members: BoardMember[];
}) {
  /** Client-only, like the board's collapsed columns. Never persisted. */
  const [collapsed, setCollapsed] = useState<string[]>([]);

  if (!groups.length) {
    return (
      <p className="text-ink-3 py-10 text-center text-sm">
        Nothing to show in this view.
      </p>
    );
  }

  return (
    <div className="h-full overflow-auto pb-6">
      <div className="flex min-w-max flex-col gap-5">
        {groups.map((lane) => {
          const isCollapsed = collapsed.includes(lane.key);

          return (
            <section key={lane.key}>
              {/* Sticky to the left edge so the lane's name stays readable while
                  the columns scroll sideways under it. */}
              <header className="sticky left-0 mb-2 flex w-fit max-w-full items-center gap-2 pr-4">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((open) =>
                      open.includes(lane.key)
                        ? open.filter((it) => it !== lane.key)
                        : [...open, lane.key],
                    )
                  }
                  className="text-ink-3 hover:text-ink hover:bg-ink/10 focus-visible:ring-brand -ml-1 rounded p-1 transition-colors outline-none focus-visible:ring-2"
                >
                  {isCollapsed ? (
                    <ChevronRightIcon className="size-4" />
                  ) : (
                    <ChevronDownIcon className="size-4" />
                  )}
                </button>

                <LaneLabel group={group} lane={lane} members={members} />

                <span className="bg-ink/10 text-ink-3 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                  {lane.todos.length}
                </span>
              </header>

              {!isCollapsed && (
                <div className="flex min-w-max items-start">
                  {orderedColumns.map((column) => {
                    // `filter` preserves order, and the lane's cards arrived in
                    // display order from `useVisibleTodos` — so this neither
                    // sorts nor needs to know which sort is on.
                    const cards = lane.todos.filter(
                      (todo) => todo.column_id === column.id,
                    );

                    return (
                      <div key={column.id} className="pr-3">
                        <KanbanColumn
                          // Lane-scoped, or every lane would register the same
                          // droppable id and @dnd-kit would be measuring one
                          // column while pointing at another.
                          id={`${lane.key}::${column.id}`}
                          column={column}
                          headerTitle={columnTitle(column.title)}
                          todos={cards}
                          indicator={{ columnId: null, index: 0 }}
                          lane
                          dragDisabled
                          onCollapse={noop}
                          onSetLimit={noop}
                          onDelete={noop}
                          canDelete={false}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** The column-level actions belong to the ungrouped board; a lane offers none. */
function noop() {}

/**
 * A lane's identity, dressed the way its dimension is dressed everywhere else —
 * the assignee's own avatar, the work type's icon, the priority's arrow — so a
 * lane header and the chip on a card inside it say the same thing the same way.
 */
function LaneLabel({
  group,
  lane,
  members,
}: {
  group: GroupKey;
  lane: TodoGroup;
  members: BoardMember[];
}) {
  if (group === "assignee") {
    const member = members.find((it) => it.id === lane.key);

    if (member) {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <MemberIdentity member={member} size="sm" />
        </span>
      );
    }
  }

  if (group === "type") {
    const meta = workTypeOf(lane.key);
    const Icon = meta.icon;

    return (
      <span className="text-ink flex min-w-0 items-center gap-1.5 text-sm font-semibold">
        <Icon className={cn("size-4 shrink-0", meta.tone)} />
        {lane.label}
      </span>
    );
  }

  if (group === "priority" && lane.key !== UNSET) {
    const meta = PRIORITIES[lane.key as Priority];
    const Icon = meta.icon;

    return (
      <span className="text-ink flex min-w-0 items-center gap-1.5 text-sm font-semibold">
        <Icon className={cn("size-4 shrink-0", meta.tone)} />
        {lane.label}
      </span>
    );
  }

  return (
    <span className="text-ink min-w-0 truncate text-sm font-semibold">
      {lane.label}
    </span>
  );
}
