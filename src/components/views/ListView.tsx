import { useCallback, useMemo, useState } from "react";
import { ChevronRightIcon, InboxIcon } from "lucide-react";

import Loading from "@/components/loading/LoadingPage";
import EmptyState from "@/components/ui/EmptyState";
import { categoryOf } from "@/constants/columns";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView, type BoardView } from "@/hooks/useBoardView";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { groupTodos } from "@/services/todos/view";
import {
  ACTION_COLUMN_WIDTH,
  resolveListColumns,
  tableMinWidth,
} from "@/services/views/listColumns";
import { useListColumns } from "@/stores/listColumns";
import { cn } from "@/utils/cn";
import { byRank } from "@/utils/rank";
import ListCreateRow from "./ListCreateRow";
import ListHeader from "./ListHeader";
import ListRow from "./ListRow";
import { GROUP_ROW_TOP, TABLE } from "./listTable";

export default function ListView() {
  const boardId = useBoardId();
  const view = useBoardView();

  const { todos, total, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const { canEditTodos } = usePermissions();
  const sprintsEnabled = useSprintsEnabled();

  // Hoisted out of the row on purpose: each of these is a query observer, and
  // one per row rather than one per table is what ListRow's memo is protecting.
  const keyPrefix = useKeyPrefix();
  const { openTask } = useOpenTask();

  const columnIds = useListColumns((state) => state.columns);

  const visibleColumns = useMemo(
    () => resolveListColumns(columnIds, { sprintsEnabled }),
    [columnIds, sprintsEnabled],
  );

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

  const groups = useMemo(() => {
    const all = groupTodos(todos, view.group, { columns, members });

    // groupTodos keeps empty status groups (they're real board columns) — the list drops them, since an empty section here is just a bare header.
    return view.group === "none" ? all : all.filter((g) => g.todos.length > 0);
  }, [todos, view.group, columns, members]);

  // Client-only, like KanbanBoard's collapsed columns: which sections you have
  // folded away is not worth a URL param or a row in the database.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);

      if (!next.delete(key)) next.add(key);

      return next;
    });
  }, []);

  // Same target HeaderTodoForm picks, and for the same reason: sorted by rank
  // rather than array order, since the cache is not guaranteed to stay sorted.
  const createColumnId = useMemo(
    () => [...columns].sort(byRank)[0]?.id,
    [columns],
  );

  const dotFor = useCallback(
    (key: string) => {
      const column = columns.find((it) => it.id === key);

      return column ? categoryOf(column.category).dot : "bg-ink/25";
    },
    [columns],
  );

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  const grouped = view.group !== "none";
  const span = visibleColumns.length + 1;

  return (
    <div className="flex h-full min-h-0 flex-col pb-4">
      <div className="border-hairline rounded-surface bg-surface flex min-h-0 flex-1 flex-col overflow-hidden border">
        {todos.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <EmptyList view={view} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table
              className={TABLE}
              style={{ minWidth: tableMinWidth(visibleColumns) }}
            >
              {/* table-fixed reads these, which is what keeps a long title from
                  widening a column and what makes the widths predictable. The
                  elastic column is left auto so it absorbs the slack. */}
              <colgroup>
                {visibleColumns.map((column) => (
                  <col
                    key={column.id}
                    style={column.elastic ? undefined : { width: column.width }}
                  />
                ))}
                <col style={{ width: ACTION_COLUMN_WIDTH }} />
              </colgroup>

              <ListHeader columns={visibleColumns} view={view} />

              {groups.map((group) => (
                <tbody key={group.key}>
                  {grouped && (
                    <GroupRow
                      span={span}
                      label={group.label}
                      count={group.todos.length}
                      dot={dotFor(group.key)}
                      collapsed={collapsed.has(group.key)}
                      onToggle={() => toggleGroup(group.key)}
                    />
                  )}

                  {!collapsed.has(group.key) &&
                    group.todos.map((todo) => (
                      <ListRow
                        key={todo.id}
                        todo={todo}
                        columns={visibleColumns}
                        canEdit={canEditTodos}
                        keyPrefix={keyPrefix}
                        membersById={membersById}
                        openTask={openTask}
                      />
                    ))}
                </tbody>
              ))}
            </table>
          </div>
        )}

        {/* Outside the scroller, so Create and the count stay put while the
            fields are scrolled sideways. */}
        <div className="border-hairline bg-canvas flex h-11 shrink-0 items-center gap-3 border-t px-2">
          <ListCreateRow columnId={createColumnId} disabled={!canEditTodos} />

          <span className="text-ink-3 text-mini ml-auto pr-2 tabular-nums">
            {todos.length === total
              ? `${total} ${total === 1 ? "item" : "items"}`
              : `${todos.length} of ${total}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function GroupRow({
  span,
  label,
  count,
  dot,
  collapsed,
  onToggle,
}: {
  span: number;
  label: string;
  count: number;
  dot: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <tr>
      <td
        colSpan={span}
        className={cn(
          "bg-canvas border-hairline sticky z-10 border-b p-0",
          GROUP_ROW_TOP,
        )}
      >
        {/* w-fit + sticky left-0 pins the heading to the viewport's left edge:
            the cell spans the whole scroll width, so without it the label
            scrolls out of sight as soon as the fields are panned. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="hover:text-ink focus-visible:ring-brand text-ink-2 sticky left-0 flex h-8 w-fit items-center gap-2 px-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <ChevronRightIcon
            className={cn(
              "text-ink-3 size-3.5 shrink-0 transition-transform duration-150",
              !collapsed && "rotate-90",
            )}
          />

          <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />

          <span className="text-mini max-w-[22rem] truncate font-semibold tracking-[0.04em] uppercase">
            {label}
          </span>

          <span className="text-ink-3 text-mini shrink-0 tabular-nums">
            {count}
          </span>
        </button>
      </td>
    </tr>
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
          hint: "Create one below and it will appear here.",
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
