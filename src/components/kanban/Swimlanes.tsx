import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon, InboxIcon } from "lucide-react";
import { useState } from "react";

import { COUNT_CHIP } from "@/components/columns/columnChrome";
import MemberIdentity from "@/components/members/MemberIdentity";
import EmptyState from "@/components/ui/EmptyState";
import { columnTitle } from "@/constants/columns";
import { PRIORITIES, type Priority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { GroupKey, TodoGroup } from "@/services/todos/view";
import { UNSET } from "@/services/todos/view";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import { EMPTY_WORKFLOW, columnIdOf } from "@/services/workflow/statuses";
import type { IColumn } from "@/types/data";
import { cn } from "@/utils/cn";
import KanbanColumn from "./KanbanColumn";

// nothing drags here — a drop would have to mean "move column" and "take this lane's assignee/type/priority" at once
export default function Swimlanes({
  groups,
  group,
  orderedColumns,
  members,
}: {
  groups: TodoGroup[];
  group: GroupKey;
  orderedColumns: IColumn[];
  members: BoardMember[];
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();

  if (!groups.length) {
    return (
      <EmptyState
        size="sm"
        icon={InboxIcon}
        title={t("kanban.nothingToShow")}
      />
    );
  }

  return (
    <div className="h-full overflow-auto pb-6">
      <div className="flex min-w-max flex-col gap-4">
        {groups.map((lane) => {
          const isCollapsed = collapsed.includes(lane.key);

          return (
            <section
              key={lane.key}
              className="border-hairline border-t pt-3 first:border-t-0 first:pt-0"
            >
              <header className="sticky left-0 mb-2 flex w-fit max-w-full items-center gap-2 pr-4">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-label={`${lane.label} lane`}
                  onClick={() =>
                    setCollapsed((open) =>
                      open.includes(lane.key)
                        ? open.filter((it) => it !== lane.key)
                        : [...open, lane.key],
                    )
                  }
                  className="text-ink-3 hover:text-ink hover:bg-wash-strong focus-visible:ring-brand rounded-control coarse:size-8 -ml-1 grid size-7 shrink-0 place-items-center transition-colors duration-150 outline-none focus-visible:ring-2"
                >
                  {isCollapsed ? (
                    <ChevronRightIcon className="size-4" />
                  ) : (
                    <ChevronDownIcon className="size-4" />
                  )}
                </button>

                <LaneLabel group={group} lane={lane} members={members} />

                <span className={COUNT_CHIP}>{lane.todos.length}</span>
              </header>

              {!isCollapsed && (
                <div className="flex min-w-max items-start">
                  {orderedColumns.map((column) => {
                    const cards = lane.todos.filter(
                      (todo) =>
                        columnIdOf(todo, workflow.statusById) === column.id,
                    );

                    return (
                      <div key={column.id} className="pr-3">
                        <KanbanColumn
                          // lane-scoped id — otherwise every lane registers the same droppable and @dnd-kit gets confused
                          id={`${lane.key}::${column.id}`}
                          column={column}
                          headerTitle={columnTitle(column.title)}
                          todos={cards}
                          indicator={{ columnId: null, index: 0 }}
                          lane
                          dragDisabled
                          onCollapse={noop}
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

function noop() {}

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
