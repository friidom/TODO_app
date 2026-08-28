import type { IColumn, Sprint, Todo } from "@/types/data";
import {
  backlogRankForAppend,
  backlogRankForDrop,
  byBacklogRank,
} from "@/utils/backlogRank";
import { byRank, rankForAppend } from "@/utils/rank";
import { isGenuineSubtask } from "./subtasks";

/**
 * The Backlog view's own grouping (M29/M31), over the array every view
 * already shares.
 *
 * **Reads `useVisibleTodos()`'s output, like every other view.** A genuine
 * Subtask never reaches this module — `useVisibleTodos` has already dropped
 * it (M27) — so "Subtasks remain attached to their Task and do not become
 * independent planning items" is satisfied by construction, the same way
 * the Timeline never had to filter one out either.
 *
 * **Board membership keeps the two axes independent, which is what the
 * migration designed them to be.** `20260830090000_backlog_and_sprints.sql`
 * states it in its own header: `column_id` answers *"is this on the
 * Board?"*, `sprint_id` answers *"is this planned into a Sprint?"*, and
 * conflating them *"would mean every pre-existing work item on every board
 * drops off the Board the instant this ships"*.
 *
 * A pass on 2026-08-27 conflated them anyway — board membership became "has
 * a column AND is in the active Sprint" — and produced exactly the outcome
 * the migration had predicted and refused: every card that predated Sprints
 * vanished, a board with no Sprint running rendered nothing at all, and
 * every card created on the Board disappeared as it was typed (nothing on
 * the create path set `sprint_id`). `isOnBoard` is the one place that rule
 * lives, and it now reads:
 *
 * > on the Board when it has a column **and** it is not committed to some
 * > *other* Sprint.
 *
 * That keeps the Sprint model doing real work — a future Sprint's planned
 * items stay off the running board, and a completed Sprint's stay off it too
 * — while an unplanned card is on the Board on its `column_id` alone, which
 * is the only fact that has ever put a card in a column. See
 * `useTodosByColumns` for where the gate is applied and `KanbanBoard` for
 * the notice that names the state without replacing the board.
 */

/** One Sprint section of the Backlog view: the sprint, and everything
 * planned into it — regardless of whether any of it has reached the Board
 * yet. */
export interface SprintSection {
  sprint: Sprint;
  items: Todo[];
}

/**
 * Whether a work item should render on the Kanban Board.
 *
 * **`column_id` is the necessary fact; `sprint_id` can only take a card
 * away.** A row with no column is in the Backlog and has no status to move
 * through, so it never qualifies — that half is unchanged and is what
 * `start_sprint` writes when it hands a Sprint's items their first column.
 *
 * Given a column, the Sprint question is asked only to *exclude*:
 *
 * | `sprint_id`                | On the Board? | Why |
 * |---|---|---|
 * | `null`                     | yes | Unplanned work. It is in a column because someone put it there, and no Sprint has claimed it — including every card that predates Sprints entirely |
 * | the active Sprint          | yes | Committed work in the running Sprint |
 * | a future/completed Sprint  | no  | Committed *elsewhere*. It keeps its column (nothing erases it) and returns to the Board when its own Sprint is the running one |
 *
 * **`activeSprintId === null` is therefore not "the Board is empty".** With
 * no Sprint running, every unplanned card in a column still shows and the
 * Board is an ordinary Kanban; only work committed to a Sprint that is not
 * running is withheld. See this module's own doc for the pass that answered
 * this differently and what it broke.
 */
export function isOnBoard(
  todo: Pick<Todo, "column_id" | "sprint_id">,
  activeSprintId: string | null,
): boolean {
  if (todo.column_id === null) return false;
  if (todo.sprint_id === null) return true;

  return todo.sprint_id === activeSprintId;
}

export interface BacklogBoard {
  /** Future and active sprints, in rank order — a completed sprint's own
   * planning is over, so it is not one of this view's sections. */
  sprintSections: SprintSection[];
  /** Never planned into any Sprint at all — the ungrouped scroll at the foot
   * of the page. `sprint_id is null`, and deliberately says nothing about
   * `column_id`: a card with no Sprint can be sitting on the Board right now
   * and still belongs here, because this list is what makes it plannable
   * into a Sprint in the first place. */
  unplanned: Todo[];
}

/**
 * Every top-level work item, grouped by which Sprint (if any) it is planned
 * into.
 *
 * `sprints` may include completed ones — the caller reads them from the same
 * board-scoped query used for Sprint Details and history, and filtering
 * "which sprints get a section here" is this function's job, not the
 * caller's.
 */
export function buildBacklogBoard(
  todos: Todo[],
  sprints: Sprint[],
): BacklogBoard {
  const sections = sprints
    .filter((sprint) => sprint.state !== "completed")
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((sprint) => ({
      sprint,
      items: todos
        .filter((todo) => todo.sprint_id === sprint.id)
        .sort(byBacklogRank),
    }));

  const unplanned = todos
    .filter((todo) => todo.sprint_id === null)
    .sort(byBacklogRank);

  return { sprintSections: sections, unplanned };
}

/**
 * The board's own first 'todo'-category column, in board order — the same
 * column `start_sprint`'s RPC bulk-assigns to a sprint's own items (see the
 * migration header). Reused here so a card entering the Board through Sprint
 * planning — created directly into an active Sprint, or moved into one —
 * lands in the same place starting that Sprint would have put it, rather
 * than a second "which column" decision that could drift from the RPC's.
 */
export function firstTodoColumn(columns: IColumn[]): IColumn | null {
  return (
    columns.filter((column) => column.category === "todo").sort(byRank)[0] ??
    null
  );
}

/**
 * Where a work item lands on the Board the moment it enters the board's
 * *active* Sprint with no column of its own yet — appended to the end of
 * `firstTodoColumn`, via `rankForAppend`, the same "append" utility
 * `useTodoDrop`/`useAddTodo` already use. `null` when the board has no
 * 'todo' column at all; callers already have a column-less fallback for
 * that (unlike `start_sprint`, this is never the only thing happening in the
 * write, so it has no exception of its own to raise).
 *
 * Shared by `sprintAssignmentPatch` below (an existing item) and
 * `useAddBacklogItem` (a brand new one) — the one place "which column, which
 * rank" is decided, so the two paths cannot disagree about where a card
 * newly on the Board through Sprint planning ends up.
 */
export function boardEntryOnActiveSprint(
  columns: IColumn[],
  todos: Todo[],
): { column_id: string; rank: number } | null {
  const column = firstTodoColumn(columns);

  if (!column) return null;

  const destination = todos.filter((todo) => todo.column_id === column.id);

  return { column_id: column.id, rank: rankForAppend(destination) };
}

/**
 * The full patch for planning an *existing* work item into `targetSprintId`
 * (or out of every Sprint, when null) — the one function `SprintControl`'s
 * dropdown (`BacklogRow`) and the Backlog page's own drag-and-drop
 * (`BacklogView`) both call, so "assign a Sprint" means exactly one write
 * everywhere it happens, matching M31's own rule against a second column
 * mutation path.
 *
 * `dropIndex` is the gap-precise position the M31-C drag hands in (already
 * translated from a rendered gap to a stored-list index by
 * `resolveDropIndex` — see `useBacklogDragEnd`). Omitted, `backlog_rank`
 * appends to the end of the destination section instead, which is what
 * `SprintControl`'s dropdown still does — it has no gap to aim at.
 */
export function sprintAssignmentPatch(
  todo: Pick<Todo, "id" | "column_id" | "sprint_id">,
  targetSprintId: string | null,
  activeSprintId: string | null,
  columns: IColumn[],
  todos: Todo[],
  dropIndex?: number,
): Partial<Pick<Todo, "sprint_id" | "column_id" | "rank" | "backlog_rank">> {
  // `todos` is the raw, unfiltered board cache — "cards and Subtasks alike"
  // (`todoApi.ts`'s own doc on `fetchTodos`) — but `dropIndex` was counted
  // over `visible`, the Backlog page's own rendered list, which never
  // contains a genuine Subtask (`useVisibleTodos` already dropped it, M27).
  // Every genuine Subtask on the *entire board* carries `sprint_id: null`
  // (`enforce_work_item_hierarchy` forbids it having its own), so leaving
  // them in here would silently pollute this section — the ungrouped
  // Backlog most of all, since that is every Subtask's own `sprint_id`
  // filter too — with rows nobody dragged past or saw, corrupting
  // `backlogRankForDrop`'s neighbour lookup at `dropIndex`.
  const destinationSection = todos.filter(
    (candidate) =>
      candidate.sprint_id === targetSprintId &&
      candidate.id !== todo.id &&
      !isGenuineSubtask(todos, candidate),
  );

  const backlog_rank =
    dropIndex !== undefined
      ? (backlogRankForDrop(destinationSection, dropIndex) ??
        backlogRankForAppend(destinationSection))
      : backlogRankForAppend(destinationSection);

  // A reorder within the section the item is already in is a position
  // change only. The branches below exist to decide Sprint membership and
  // Board placement — firing them here would have "drag it one slot down"
  // clear a column the item never actually left, since `targetSprintId`
  // trivially equals `todo.sprint_id` on every in-section drag.
  if (targetSprintId === todo.sprint_id) {
    return { backlog_rank };
  }

  if (targetSprintId === null) {
    // Dragging a card into the Backlog section is "take this off the Board",
    // so the column goes with the Sprint. Under `isOnBoard`'s rule an
    // unplanned card with a column is still ON the Board, so clearing it is
    // what makes the gesture mean anything — leaving it would move the card
    // in the Backlog view while it sat unmoved in its column behind you.
    return { sprint_id: null, column_id: null, backlog_rank };
  }

  if (todo.column_id !== null || targetSprintId !== activeSprintId) {
    return { sprint_id: targetSprintId, backlog_rank };
  }

  const entry = boardEntryOnActiveSprint(columns, todos);

  return entry
    ? { sprint_id: targetSprintId, backlog_rank, ...entry }
    : { sprint_id: targetSprintId, backlog_rank };
}
