import type { IColumn, Sprint, Todo } from "@/types/data";
import {
  backlogRankForAppend,
  backlogRankForDrop,
  byBacklogRank,
} from "@/utils/backlogRank";
import { byRank, rankForAppend } from "@/utils/rank";
import { isGenuineSubtask } from "./subtasks";

// column_id and sprint_id are independent: column_id says it's on the board, sprint_id says it's planned.
// Don't collapse them into "has a column AND is in the active sprint" — that was tried and it made every
// pre-sprint card and every newly created card vanish from the board.
export interface SprintSection {
  sprint: Sprint;
  items: Todo[];
}

// No column = not on the board, full stop. With a column, sprint_id only ever excludes (a card
// committed to a future/completed sprint keeps its column but stays off the board until its own
// sprint runs). No active sprint doesn't mean an empty board — unplanned cards still show.
export function isOnBoard(
  todo: Pick<Todo, "column_id" | "sprint_id">,
  activeSprintId: string | null,
): boolean {
  if (todo.column_id === null) return false;
  if (todo.sprint_id === null) return true;

  return todo.sprint_id === activeSprintId;
}

export interface BacklogBoard {
  // Future and active sprints only — a completed sprint's planning is over.
  sprintSections: SprintSection[];
  unplanned: Todo[];
}

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

// Same column start_sprint's RPC bulk-assigns to a sprint's items — kept in sync so a card
// entering the board via sprint planning lands where starting the sprint would've put it.
export function firstTodoColumn(columns: IColumn[]): IColumn | null {
  return (
    columns.filter((column) => column.category === "todo").sort(byRank)[0] ??
    null
  );
}

// Shared by sprintAssignmentPatch and useAddBacklogItem so both paths agree on where a card
// lands when it enters the board through sprint planning. null when there's no todo column at all.
export function boardEntryOnActiveSprint(
  columns: IColumn[],
  todos: Todo[],
): { column_id: string; rank: number } | null {
  const column = firstTodoColumn(columns);

  if (!column) return null;

  const destination = todos.filter((todo) => todo.column_id === column.id);

  return { column_id: column.id, rank: rankForAppend(destination) };
}

// The one place "assign a sprint" is written — both the SprintControl dropdown and Backlog
// drag-and-drop call this, so it's a single write everywhere. dropIndex omitted just appends.
export function sprintAssignmentPatch(
  todo: Pick<Todo, "id" | "column_id" | "sprint_id">,
  targetSprintId: string | null,
  activeSprintId: string | null,
  columns: IColumn[],
  todos: Todo[],
  dropIndex?: number,
): Partial<Pick<Todo, "sprint_id" | "column_id" | "rank" | "backlog_rank">> {
  // todos is the raw board cache, subtasks included — but dropIndex was counted over the
  // rendered list, which never has subtasks in it. Filter them out or the rank lookup misfires.
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

  // reorder within the same section — don't touch sprint/column, or dragging one slot down
  // would clear a column the card never actually left
  if (targetSprintId === todo.sprint_id) {
    return { backlog_rank };
  }

  if (targetSprintId === null) {
    // dragging into the unplanned section takes it off the board too, per isOnBoard's rule
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
