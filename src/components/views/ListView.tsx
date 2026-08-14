import { useMemo } from "react";

import ViewNotice from "@/components/board/ViewNotice";
import Loading from "@/components/loading/LoadingPage";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { groupTodos } from "@/services/todos/view";
import ListRow from "./ListRow";

/**
 * The board as a dense table.
 *
 * **One board, two layouts.** It reads the same `useVisibleTodos` the Kanban
 * does, so the filter and the sort are not merely consistent between the views —
 * they are the same computation, and there is no second query, no second cache
 * entry and no second model. Flipping between board and list changes one search
 * param and nothing else.
 *
 * Grouping works here too, as section headers rather than swimlanes. The
 * `groupTodos` call is identical; only what is drawn around each group differs.
 *
 * Ordering is not decided here either. `useVisibleTodos` hands over an array
 * already in display order — the sort's, or the board's own under `Manual` — so
 * the rows are in the order the board would show them, by construction rather
 * than by a second implementation of the same rule.
 */
export default function ListView() {
  const boardId = useBoardId();
  const view = useBoardView();
  const { todos, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const groups = useMemo(() => {
    const all = groupTodos(todos, view.group, { columns, members });

    // `groupTodos` keeps empty groups under `status` on purpose — an empty
    // column is part of the BOARD whether or not anything is in it, and hiding
    // it would make the board's shape depend on its contents. A list has no
    // such shape to preserve: an empty section here is a header, a zero and
    // nothing else. So the rule is the same everywhere it means something, and
    // the one caller it does not serve drops them at render.
    return view.group === "none" ? all : all.filter((g) => g.todos.length > 0);
  }, [todos, view.group, columns, members]);

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  const grouped = view.group !== "none";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewNotice view={view} visibleCount={todos.length} />

      {/* The table scrolls inside its own box on a narrow screen. The page never
          does — that is the rule the board already follows. */}
      <div className="border-hairline bg-surface rounded-surface mb-4 min-h-0 flex-1 overflow-auto border">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface sticky top-0 z-10">
            <tr className="border-hairline text-ink-3 border-b text-[10px] font-semibold tracking-[0.08em] uppercase">
              <th
                scope="col"
                className="hidden py-2 pr-2 pl-3 font-semibold sm:table-cell"
              >
                Type
              </th>
              <th
                scope="col"
                className="hidden py-2 pr-2 font-semibold sm:table-cell"
              >
                Key
              </th>
              <th scope="col" className="py-2 pr-2 pl-3 font-semibold sm:pl-0">
                Summary
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Status
              </th>
              <th
                scope="col"
                className="hidden py-2 pr-2 font-semibold lg:table-cell"
              >
                Priority
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Assignee
              </th>
              <th
                scope="col"
                className="hidden py-2 pr-2 font-semibold lg:table-cell"
              >
                Due
              </th>
              <th scope="col" className="py-2 pr-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          {groups.map((group) => (
            <tbody key={group.key}>
              {grouped && (
                <tr className="border-hairline bg-elevated border-b">
                  <th
                    scope="colgroup"
                    colSpan={8}
                    className="text-ink-2 px-3 py-1.5 text-left text-xs font-semibold"
                  >
                    {group.label}
                    <span className="text-ink-3 ml-2 font-normal">
                      {group.todos.length}
                    </span>
                  </th>
                </tr>
              )}

              {group.todos.map((todo) => (
                <ListRow key={todo.id} todo={todo} />
              ))}
            </tbody>
          ))}
        </table>

        {todos.length === 0 && (
          <p className="text-ink-3 py-10 text-center text-sm">
            {/* Search is named separately from the filter: an empty result
                with a search box full of text has an obvious cause, and
                blaming "the current filter" when none is set sends the user
                to the wrong control. */}
            {view.query.trim()
              ? `Nothing matches “${view.query.trim()}”.`
              : view.filterCount > 0
                ? "No work items match the current filter."
                : "No work items on this board yet."}
          </p>
        )}
      </div>
    </div>
  );
}
