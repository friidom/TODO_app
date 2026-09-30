import { useCallback, useMemo, useState } from "react";
import { ChevronRightIcon, InboxIcon } from "lucide-react";

import { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import type { ReorderMove } from "@/components/dnd/reorderDnd";
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
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { subtasksByParent } from "@/services/todos/subtasks";
import {
  EMPTY_WORKFLOW,
  columnIdOf,
  defaultStatus,
  doneStatusIds,
  isDoneIn,
} from "@/services/workflow/statuses";
import { useStatuses, useWorkflow } from "@/services/workflow/useWorkflow";
import { useTodoDrop } from "@/services/todos/useTodoDrop";
import { useTodos } from "@/services/todos/useTodos";
import { groupTodos } from "@/services/todos/view";
import {
  ACTION_COLUMN_WIDTH,
  LIST_COLUMNS,
  SELECT_COLUMN_WIDTH,
  isListColumnId,
  listColumnWidth,
  resolveListColumns,
  tableMinWidth,
} from "@/services/views/listColumns";
import { useListColumnWidths, useListColumns } from "@/stores/listColumns";
import type { IStatus, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import ListCreateRow from "./ListCreateRow";
import ListHeader from "./ListHeader";
import ListRow from "./ListRow";
import {
  LIST_COLUMN_GROUP,
  rowDropIndex,
  rowLabel,
  rowReorderContainer,
} from "./listReorder";
import { FRAME, GROUP_ROW_TOP, TABLE } from "./listTable";

const NO_TODOS: Todo[] = [];
const NO_CHILDREN: Todo[] = [];
const NO_STATUSES: IStatus[] = [];

export default function ListView() {
  const boardId = useBoardId();
  const view = useBoardView();

  const { todos, total, isLoading, error } = useVisibleTodos();
  const { data: rows = NO_TODOS } = useTodos();
  const { data: statuses = NO_STATUSES } = useStatuses();
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();
  const todoDrop = useTodoDrop();
  const { data: members = [] } = useBoardMembers(boardId);

  const { canEditTodos } = usePermissions();
  const sprintsEnabled = useSprintsEnabled();

  // Hoisted out of the row on purpose: each of these is a query observer, and
  // one per row rather than one per table is what ListRow's memo is protecting.
  const keyPrefix = useKeyPrefix();
  const { openTask } = useOpenTask();

  const columnIds = useListColumns((state) => state.columns);
  const widths = useListColumnWidths(boardId);
  const moveColumn = useListColumns((state) => state.move);

  const visibleColumns = useMemo(
    () => resolveListColumns(columnIds, { sprintsEnabled }),
    [columnIds, sprintsEnabled],
  );

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

  // The pipeline drops genuine subtasks from every view; the List files them
  // back under their parent rather than listing them among the rows.
  const subtasks = useMemo(() => subtasksByParent(rows), [rows]);

  const doneStatuses = useMemo(() => doneStatusIds(statuses), [statuses]);

  const groups = useMemo(() => {
    const all = groupTodos(todos, view.group, { statuses, members });

    // groupTodos keeps empty status groups (a visible status can still receive work) — the list drops them, since an empty section here is just a bare header.
    return view.group === "none" ? all : all.filter((g) => g.todos.length > 0);
  }, [todos, view.group, statuses, members]);

  // Client-only, like KanbanBoard's collapsed columns: which sections you have
  // folded away, which parents you opened and which rows you ticked are not
  // worth a URL param or a row in the database.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((current) => toggled(current, key));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((current) => toggled(current, id));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((current) => toggled(current, id));
  }, []);

  const parents = useMemo(
    () => todos.filter((todo) => subtasks.has(todo.id)).map((todo) => todo.id),
    [todos, subtasks],
  );

  const allExpanded =
    parents.length > 0 && parents.every((id) => expanded.has(id));

  // Counted over what the table can show, so a row a filter has since hidden
  // does not keep "3 selected" alive with nothing ticked on screen.
  const selectedCount = useMemo(() => {
    let count = 0;

    for (const todo of todos) {
      if (selected.has(todo.id)) count += 1;

      for (const child of subtasks.get(todo.id) ?? NO_CHILDREN) {
        if (selected.has(child.id)) count += 1;
      }
    }

    return count;
  }, [todos, subtasks, selected]);

  const allSelected =
    todos.length > 0 && todos.every((todo) => selected.has(todo.id));

  // Same target HeaderTodoForm picks.
  const createStatusId = useMemo(() => defaultStatus(statuses)?.id, [statuses]);

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  const grouped = view.group !== "none";
  const span = visibleColumns.length + 2;
  const rowsDraggable = canEditTodos && !view.dndDisabled;

  const todoById = (id: string) => rows.find((todo) => todo.id === id);

  function onReorder({ activeId, overId, side, data }: ReorderMove) {
    if (!side) return;

    if (data.group === LIST_COLUMN_GROUP) {
      if (isListColumnId(activeId) && isListColumnId(overId)) {
        moveColumn(activeId, overId, side);
      }

      return;
    }

    const activeTodo = todoById(activeId);
    const columnId = activeTodo && columnIdOf(activeTodo, workflow.statusById);

    if (!activeTodo?.status_id || !columnId) return;

    todoDrop.mutate({
      todos: rows,
      activeTodo,
      columnId,
      statusId: activeTodo.status_id,
      index: rowDropIndex(rows, activeTodo, overId, side, workflow.statusById),
    });
  }

  function describe(id: string) {
    if (isListColumnId(id)) return LIST_COLUMNS[id].label;

    const todo = todoById(id);

    return todo ? rowLabel(todo, keyPrefix) : id;
  }

  function row(todo: Todo, depth: number, childCount: number, open: boolean) {
    return (
      <ListRow
        key={todo.id}
        todo={todo}
        columns={visibleColumns}
        canEdit={canEditTodos}
        keyPrefix={keyPrefix}
        membersById={membersById}
        openTask={openTask}
        done={isDoneIn(todo, doneStatuses)}
        depth={depth}
        childCount={childCount}
        expanded={open}
        onToggleExpand={toggleExpand}
        selected={selected.has(todo.id)}
        onToggleSelect={toggleSelect}
        dragContainer={
          rowsDraggable && depth === 0
            ? rowReorderContainer(todo, view.group, workflow.statusById)
            : null
        }
      />
    );
  }

  // One level only: enforce_work_item_hierarchy refuses a Subtask children of its own.
  function withSubtasks(todo: Todo) {
    const children = subtasks.get(todo.id) ?? NO_CHILDREN;
    const open = children.length > 0 && expanded.has(todo.id);

    return [
      row(todo, 0, children.length, open),
      ...(open ? children.map((child) => row(child, 1, 0, false)) : []),
    ];
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(FRAME, "flex min-h-0 flex-1 flex-col overflow-hidden")}
      >
        {todos.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <EmptyList view={view} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <ReorderContext
              onReorder={onReorder}
              describe={describe}
              renderOverlay={(id) => {
                if (isListColumnId(id)) {
                  return <DragChip>{LIST_COLUMNS[id].label}</DragChip>;
                }

                const todo = todoById(id);

                return (
                  <DragChip>
                    {todo && (
                      <span className="text-ink-3 shrink-0">
                        {rowLabel(todo, keyPrefix)}
                      </span>
                    )}
                    <span className="truncate">{todo?.title}</span>
                  </DragChip>
                );
              }}
            >
              <table
                className={TABLE}
                style={{ minWidth: tableMinWidth(visibleColumns, widths) }}
              >
                {/* table-fixed reads these, which is what keeps a long title from
                  widening a column and what makes the widths predictable. The
                  elastic column is left auto so it absorbs the slack. */}
                <colgroup>
                  <col style={{ width: SELECT_COLUMN_WIDTH }} />
                  {visibleColumns.map((column) => (
                    <col
                      key={column.id}
                      data-column={column.id}
                      style={
                        column.elastic
                          ? undefined
                          : { width: listColumnWidth(column, widths) }
                      }
                    />
                  ))}
                  <col style={{ width: ACTION_COLUMN_WIDTH }} />
                </colgroup>

                <ListHeader
                  columns={visibleColumns}
                  view={view}
                  allSelected={allSelected}
                  someSelected={selectedCount > 0}
                  onSelectAll={(next) =>
                    setSelected(
                      next ? new Set(todos.map((todo) => todo.id)) : new Set(),
                    )
                  }
                  canExpand={parents.length > 0}
                  allExpanded={allExpanded}
                  onExpandAll={() =>
                    setExpanded(allExpanded ? new Set() : new Set(parents))
                  }
                />

                {groups.map((group) => (
                  <tbody key={group.key}>
                    {grouped && (
                      <GroupRow
                        span={span}
                        label={group.label}
                        count={group.todos.length}
                        lozenge={
                          view.group === "status"
                            ? categoryOf(
                                statuses.find(
                                  (status) => status.id === group.key,
                                )?.category,
                              ).lozenge
                            : null
                        }
                        collapsed={collapsed.has(group.key)}
                        onToggle={() => toggleGroup(group.key)}
                      />
                    )}

                    {!collapsed.has(group.key) &&
                      group.todos.flatMap(withSubtasks)}
                  </tbody>
                ))}
              </table>
            </ReorderContext>
          </div>
        )}

        {/* Outside the scroller, so Create and the count stay put while the
            fields are scrolled sideways. */}
        <div className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-(--list-line) px-2">
          <div className="min-w-0">
            <ListCreateRow statusId={createStatusId} disabled={!canEditTodos} />
          </div>

          <span className="text-ink-2 text-sm tabular-nums">
            {todos.length === total
              ? `${total} ${total === 1 ? "item" : "items"}`
              : `${todos.length} of ${total}`}
          </span>

          {selectedCount > 0 && (
            <span className="text-ink-2 flex items-center gap-2 justify-self-end text-sm">
              <span className="tabular-nums">{selectedCount} selected</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-brand focus-visible:ring-brand rounded font-medium outline-none hover:underline focus-visible:ring-2"
              >
                Clear
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);

  if (!next.delete(key)) next.add(key);

  return next;
}

function GroupRow({
  span,
  label,
  count,
  lozenge,
  collapsed,
  onToggle,
}: {
  span: number;
  label: string;
  count: number;
  /** A status group reads as the status control it collects; null for the rest. */
  lozenge: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <tr>
      <td
        colSpan={span}
        className={cn(
          "sticky z-10 border-b border-(--list-line) bg-(--list-head) p-0",
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
          className="focus-visible:ring-brand text-ink sticky left-0 flex h-10 w-fit max-w-full items-center gap-2 pr-3 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span className="text-ink-2 grid size-6 shrink-0 place-items-center">
            <ChevronRightIcon
              className={cn(
                "size-4 transition-transform duration-150",
                !collapsed && "rotate-90",
              )}
            />
          </span>

          {lozenge === null ? (
            <span className="max-w-[22rem] truncate text-sm font-semibold">
              {label}
            </span>
          ) : (
            <span
              className={cn(
                "text-meta inline-flex h-5 max-w-[22rem] items-center rounded border px-1.5",
                lozenge,
              )}
            >
              <span className="truncate">{label}</span>
            </span>
          )}

          <span className="bg-ink/[0.08] text-ink-2 rounded-full px-1.5 text-xs font-medium tabular-nums">
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
