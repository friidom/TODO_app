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

/**
 * The board as an issue list.
 *
 * **One board, two layouts.** It reads the same `useVisibleTodos` the Kanban
 * does, so the filter and the sort are not merely consistent between the views —
 * they are the same computation, and there is no second query, no second cache
 * entry and no second model. Flipping between board and list changes one search
 * param and nothing else.
 *
 * **A list, not a table, and the distinction is the whole design.** It was a
 * real `<table>` with a `<colgroup>` and eight column headings, and it read as
 * one: every field boxed, filled and labelled at the same weight, so the screen
 * answered "what properties does this row have" when the question anyone
 * actually arrives with is "which item is this". The rewrite is a CSS grid
 * (`listGrid.ts`) whose only elastic track is the title, with the metadata
 * demoted to indicators — `bare` on the type, priority and due controls — and a
 * column header light enough to name the tracks without competing with them.
 * The `role="table"` / `row` / `cell` attributes keep for a screen reader the
 * structure the markup gave up, because the columns are still real.
 *
 * Grouping works here too, as section dividers rather than swimlanes. The
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

  /**
   * The divider's dot, in the group's own colour where it has one.
   *
   * Grouping by status keys each group by `column.id`, so the board's category
   * palette applies and a "Done" section here is the same green it is on the
   * board — which is the whole reason to draw a dot at all. The other three
   * groupings (assignee, priority, type) key by something with no place on that
   * palette, so they get a neutral mark rather than a colour that would claim a
   * meaning it does not have.
   */
  const dotFor = (key: string) => {
    const column = columns.find((it) => it.id === key);

    return column ? categoryOf(column.category).dot : "bg-ink/25";
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The list scrolls inside its own box on a narrow screen. The page never
          does — that is the rule the board already follows. */}
      <div className="border-hairline rounded-surface mb-4 min-h-0 flex-1 overflow-auto border">
        <div role="table" aria-label="Work items" className={LIST_MIN_WIDTH}>
          {/* THE COLUMN HEADER — deliberately the quietest row on the screen.
              It exists to name what the four right-hand tracks are, once, and
              then to get out of the way of thirty rows of work. 10px, muted,
              and 32px tall, which is also the offset the group dividers stick
              at. */}
          <div role="rowgroup" className="bg-canvas sticky top-0 z-20">
            <div
              role="row"
              className={cn(
                LIST_GRID,
                "border-hairline text-ink-3/70 h-8 border-b text-[10px] font-medium tracking-[0.08em] uppercase",
              )}
            >
              {/* Four of the eight tracks are 20–24px of glyph or avatar, and
                  no label fits over them — nor would one help anyone who can see
                  the column. Their names are carried by a nested `sr-only` span
                  rather than by `sr-only` on the header itself: `sr-only` is
                  `position: absolute`, and an absolutely positioned child of a
                  grid is not a grid item at all, so hiding the header that way
                  would take its track with it and slide every column left of
                  where its values are. The outer span stays in flow and empty;
                  the inner one is what is hidden. */}
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

/**
 * A section break, not another row.
 *
 * It used to be a `<th colSpan>` styled like a heavier version of the rows
 * beneath it, which is what a table gives you and is exactly the "administrative
 * database" reading the list was trying to lose. A divider is a rule across the
 * list with a name on it: a dot in the group's own colour, the label, and the
 * count pushed to the far end — the same shape a board column header has, which
 * is the point, because grouping by status *is* the board's columns laid out
 * down the page.
 *
 * Sticky at the column header's own height, so scrolling a long group never
 * leaves you without the name of the section you are inside. The rules are inset
 * shadows rather than borders so nothing in the sticky element's own box changes
 * as it detaches.
 */
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
        <span className="text-ink-2 truncate text-[11px] font-semibold tracking-[0.04em] uppercase">
          {label}
        </span>
      </span>

      <span className="text-ink-3 ml-auto shrink-0 text-[11px] tabular-nums">
        {count} {count === 1 ? "task" : "tasks"}
      </span>
    </div>
  );
}

/**
 * Nothing to show, and why.
 *
 * **It replaces `ViewNotice` here rather than joining it.** The board renders
 * that strip above an empty grid because an empty *board* still has its columns
 * to look at; an empty list has nothing at all, so the same message sat above a
 * bare header row and the two together read as one broken screen. The list gets
 * one empty state that fills the space instead — carrying the same undo, so
 * nothing was lost with the strip.
 *
 * Search is named separately from the filter: an empty result with a search box
 * full of text has an obvious cause, and blaming "the current filter" when none
 * is set sends the user to the wrong control.
 */
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
    <div className="flex flex-col items-center gap-1 px-6 py-16 text-center">
      {/* No border on the disc: the list around it is built out of hairlines
          and one more outlined object in the middle of the empty space reads as
          another control rather than as an illustration. */}
      <span className="bg-ink/[0.06] text-ink-3 mb-3 grid size-10 place-items-center rounded-full">
        <InboxIcon className="size-4" />
      </span>

      <p className="text-ink text-sm font-medium">{title}</p>
      <p className="text-ink-3 max-w-xs text-xs">{hint}</p>

      {action && (
        <button
          type="button"
          onClick={action.run}
          className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control mt-3 px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
