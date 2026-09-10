import { useMemo } from "react";
import { InboxIcon } from "lucide-react";

import Loading from "@/components/loading/LoadingPage";
import { categoryOf } from "@/constants/columns";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView, type BoardView } from "@/hooks/useBoardView";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { groupTodos } from "@/services/todos/view";
import { cn } from "@/utils/cn";
import ListRow from "./ListRow";
import { LIST_GRID, LIST_MIN_WIDTH } from "./listGrid";
import EmptyState from "@/components/ui/EmptyState";

export default function ListView() {
  const boardId = useBoardId();
  const view = useBoardView();
  const { todos, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const groups = useMemo(() => {
    const all = groupTodos(todos, view.group, { columns, members });

    // groupTodos keeps empty status groups (they're real board columns) — the list drops them, since an empty section here is just a bare header.
    return view.group === "none" ? all : all.filter((g) => g.todos.length > 0);
  }, [todos, view.group, columns, members]);

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  const grouped = view.group !== "none";

  const dotFor = (key: string) => {
    const column = columns.find((it) => it.id === key);

    return column ? categoryOf(column.category).dot : "bg-ink/25";
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-hairline rounded-surface mb-4 min-h-0 flex-1 overflow-auto border">
        <div role="table" aria-label="Work items" className={LIST_MIN_WIDTH}>
          <div role="rowgroup" className="bg-canvas sticky top-0 z-20">
            <div
              role="row"
              className={cn(
                LIST_GRID,
                "border-hairline text-ink-3/70 text-micro h-8 border-b font-medium tracking-[0.08em] uppercase",
              )}
            >
              {/* sr-only on the inner span, not the header itself — sr-only is position:absolute, which would drop the header out of the grid track */}
              <span role="columnheader">
                <span className="sr-only">Type</span>
              </span>
              <span role="columnheader">Key</span>
              <span role="columnheader">Title</span>
              <span role="columnheader">Status</span>
              <span role="columnheader" className="hidden lg:block">
                <span className="sr-only">Priority</span>
              </span>
              <span role="columnheader">
                <span className="sr-only">Assignee</span>
              </span>
              <span role="columnheader" className="hidden text-right lg:block">
                Due
              </span>
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>
          </div>

          {groups.map((group) => (
            <div role="rowgroup" key={group.key}>
              {grouped && (
                <GroupDivider
                  label={group.label}
                  count={group.todos.length}
                  dot={dotFor(group.key)}
                />
              )}

              {group.todos.map((todo) => (
                <ListRow key={todo.id} todo={todo} />
              ))}
            </div>
          ))}
        </div>

        {todos.length === 0 && <EmptyList view={view} />}
      </div>
    </div>
  );
}

function GroupDivider({
  label,
  count,
  dot,
}: {
  label: string;
  count: number;
  dot: string;
}) {
  return (
    <div
      role="row"
      className="bg-canvas sticky top-8 z-10 flex h-8 items-center gap-2 px-4 shadow-[inset_0_-1px_0_var(--hairline)]"
    >
      <span role="rowheader" className="flex min-w-0 items-center gap-2">
        <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
        <span className="text-ink-2 text-mini truncate font-semibold tracking-[0.04em] uppercase">
          {label}
        </span>
      </span>

      <span className="text-ink-3 text-mini ml-auto shrink-0 tabular-nums">
        {count} {count === 1 ? "task" : "tasks"}
      </span>
    </div>
  );
}

function EmptyList({ view }: { view: BoardView }) {
  const query = view.query.trim();

  const { title, hint, action } = query
    ? {
        title: `Nothing matches “${query}”`,
        hint: "Try a shorter term, or a work item key like KAN-12.",
        action: { label: "Clear search", run: () => view.setQuery("") },
      }
    : view.filterCount > 0
      ? {
          title: "No work items match this filter",
          hint: "Every item on the board is hidden by the current filter.",
          action: { label: "Clear filters", run: view.clearFilters },
        }
      : {
          title: "No work items yet",
          hint: "Create one from the toolbar and it will appear here.",
          action: null,
        };

  return (
    <EmptyState
      icon={InboxIcon}
      title={title}
      hint={hint}
      action={action ?? undefined}
    />
  );
}
