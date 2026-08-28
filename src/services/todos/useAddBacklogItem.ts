import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useSprints } from "@/services/sprints/useSprints";
import { backlogRankForAppend } from "@/utils/backlogRank";
import type { IColumn, Sprint, Todo } from "@/types/data";
import { applySubtaskInserted, applyTodoUpdated } from "./cache";
import { boardEntryOnActiveSprint } from "./backlog";
import { addBacklogItem } from "./todoApi";

/**
 * Column and rank for a brand new item created straight into `sprintId` —
 * `boardEntryOnActiveSprint` when that Sprint is the board's active one,
 * null otherwise. The one place this hook decides "does this appear on the
 * Board the moment it exists", shared between `mutationFn`'s write and
 * `onMutate`'s optimistic row so the two cannot disagree.
 */
function boardEntryFor(
  sprintId: string | null,
  sprints: Sprint[],
  columns: IColumn[],
  todos: Todo[],
) {
  const activeSprintId = sprints.find((s) => s.state === "active")?.id ?? null;

  if (sprintId === null || sprintId !== activeSprintId) return null;

  return boardEntryOnActiveSprint(columns, todos);
}

export interface AddBacklogItemVars {
  title: string;
  /** Defaults to Task, matching `useAddTodo`. `Epic` is the other type this
   * view supports creating directly (M29's "at minimum: Epic, normal Task"). */
  type?: string;
  /** Appends into this Sprint's own section when set; the ungrouped Backlog
   * section — `sprint_id: null` — when omitted. */
  sprintId?: string | null;
}

/**
 * Create a work item straight into the Backlog view (M29).
 *
 * **A separate mutation from `useAddTodo`, for the reason `useAddSubtask`
 * is one.** This item needs a `backlog_rank`, computed over whichever
 * section it is being appended to — the Backlog itself, or one Sprint's —
 * never over a column's contents. It has no column *unless* `sprintId` is
 * the board's own active Sprint (M31), in which case `boardEntryFor` gives
 * it one immediately — the same rule `sprintAssignmentPatch` applies to an
 * existing item planned into a running Sprint, so "create inside an active
 * Sprint" and "drag into one" put a card in the same place.
 *
 * **A whole-row replace on success, not a slot-keeping correction** —
 * `applyTodoUpdated`, the same choice `useAddSubtask` makes and for the same
 * reason: every backlog create is already an append, so there is no chosen
 * gap for the server's own append to disagree with.
 *
 * The id is minted once, in `mutate` below, and threaded through both
 * `mutationFn` and `onMutate` as part of the same variables object — the
 * pattern every create mutation in this file uses, so the optimistic row and
 * the row the server writes back are always the same row.
 */
export function useAddBacklogItem() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const { data: columns = [] } = useColumns();
  const { data: sprints = [] } = useSprints();

  const mutation = useMutation({
    mutationFn: ({
      id,
      title,
      type = DEFAULT_WORK_TYPE,
      sprintId = null,
    }: AddBacklogItemVars & { id: string }) => {
      if (!boardId) throw new Error("useAddBacklogItem ran without a board");

      const todos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const section = todos.filter((todo) => todo.sprint_id === sprintId);
      const entry = boardEntryFor(sprintId, sprints, columns, todos);

      return addBacklogItem({
        id,
        title,
        board_id: boardId,
        type,
        sprint_id: sprintId,
        backlog_rank: backlogRankForAppend(section),
        column_id: entry?.column_id ?? null,
        rank: entry?.rank ?? null,
      });
    },

    onMutate: async ({
      id,
      title,
      type = DEFAULT_WORK_TYPE,
      sprintId = null,
    }) => {
      if (!boardId) throw new Error("useAddBacklogItem ran without a board");

      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const section = previousTodos.filter(
        (todo) => todo.sprint_id === sprintId,
      );
      const entry = boardEntryFor(sprintId, sprints, columns, previousTodos);

      const optimisticTodo: Todo = {
        id,
        title,
        board_id: boardId,
        column_id: entry?.column_id ?? null,
        position: null,
        rank: entry?.rank ?? null,
        backlog_rank: backlogRankForAppend(section),
        // Allocated by the M2-21 trigger, so the client cannot know it yet.
        board_key: null,
        type,
        priority: null,
        assignee_id: null,
        estimate: null,
        parent_id: null,
        sprint_id: sprintId,
        start_date: null,
        due_date: null,
        created_at: new Date().toISOString(),
        updated_at: null,
      };

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applySubtaskInserted(previousTodos, optimisticTodo),
      );

      return { previousTodos };
    },

    onError: (_err, _vars, context) => {
      if (!context) return;

      queryClient.setQueryData(queryKeys.todos(boardId), context.previousTodos);
    },

    onSuccess: (serverTodo) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old = []) =>
        applyTodoUpdated(old, serverTodo),
      );
    },
  });

  // Minted here rather than in `onMutate`, for the reason `useAddTodo`
  // records: it has to reach `mutationFn` too, and `onMutate` cannot add to
  // the variables it was given.
  const mutate = (variables: AddBacklogItemVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
