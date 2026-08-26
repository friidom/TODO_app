import { useMutation, useQueryClient } from "@tanstack/react-query";

import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "@/types/data";
import { applySubtaskInserted, applyTodoUpdated } from "./cache";
import { addTodo } from "./todoApi";

export interface AddSubtaskVars {
  title: string;
  /** The task this becomes a child of. Never chosen by the user — it is the
   * panel they are already looking at. */
  parentId: string;
  /**
   * Where the subtask starts.
   *
   * The parent's own column, supplied by the caller. Status in this schema is
   * column membership (M2-15), so a subtask needs one to have a status at
   * all, and starting it beside its parent is the only answer that does not
   * invent an intent — the same reasoning `useMoveTodo` gives for appending
   * rather than guessing a slot.
   */
  columnId: string;
}

/**
 * Create one subtask (M27).
 *
 * **A separate mutation from `useAddTodo`, and the split is the point.** That
 * one exists to place a card in a column: it computes an optimistic rank from
 * the card's neighbours, renumbers the destination's dense positions around
 * it, and follows up with `reorderTodos` when the server's append disagrees
 * with the slot the user picked. Every one of those steps is about a position
 * on the board, and a subtask has none — it is never drawn in a column, never
 * dragged, and never competes for a gap. Reusing `useAddTodo` would mean
 * running all of that machinery and then having to suppress it.
 *
 * What it does share is the write itself: `addTodo`, one upsert, one
 * client-minted uuid, so the optimistic row and the stored row are the same
 * row. The depth rule is not checked here at all — `enforce_subtask_depth`
 * refuses a parent that is itself a subtask, and a client-side copy of that
 * rule that ever disagreed with the trigger would be the more dangerous of
 * the two. The UI's job is only to not *offer* the illegal action, which
 * `canHaveSubtasks` does.
 *
 * It writes into `["todos", boardId]` — the board's own entry — because that
 * is where subtasks live. `fetchTodos` returns them, `useVisibleTodos` gates
 * them out of the views, and the parent panel reads its children back out of
 * the same array. So a create shows up in the panel and in the parent card's
 * `0/3` indicator with no second cache to keep in step.
 */
export function useAddSubtask() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  const mutation = useMutation({
    mutationFn: ({
      id,
      title,
      parentId,
      columnId,
    }: AddSubtaskVars & { id: string }) => {
      if (!boardId) throw new Error("useAddSubtask ran without a board");

      return addTodo({
        id,
        title,
        column_id: columnId,
        board_id: boardId,
        parent_id: parentId,
        type: DEFAULT_WORK_TYPE,
      });
    },

    onMutate: async ({ id, title, parentId, columnId }) => {
      if (!boardId) throw new Error("useAddSubtask ran without a board");

      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const optimistic: Todo = {
        id,
        title,
        board_id: boardId,
        column_id: columnId,
        parent_id: parentId,
        // Allocated by the M2-21 trigger, so the client cannot know it yet —
        // the row renders without a key until the server answers, exactly as
        // a new card does.
        board_key: null,
        type: DEFAULT_WORK_TYPE,
        priority: null,
        assignee_id: null,
        estimate: null,
        start_date: null,
        due_date: null,
        // Both meaningless for a subtask: nothing orders this list by either,
        // and `subtasksOf` sorts by `created_at`. Null rather than a fabricated
        // number, so no reader can mistake them for an order somebody chose.
        position: null,
        rank: null,
        created_at: new Date().toISOString(),
        updated_at: null,
      };

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applySubtaskInserted(previousTodos, optimistic),
      );

      return { previousTodos };
    },

    onError: (_err, _vars, context) => {
      if (!context) return;

      queryClient.setQueryData(queryKeys.todos(boardId), context.previousTodos);
    },

    onSuccess: (serverTodo) => {
      // A whole-row replace rather than `applyTodoConfirmed`: that one keeps
      // the client's optimistic `position`/`rank` because a card's slot was
      // chosen by the user and the server only ever appends. A subtask has no
      // slot to preserve, so the server's row is the whole answer.
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old = []) =>
        applyTodoUpdated(old, serverTodo),
      );

      // The parent's own History tab, if it is open (M27). The insert trigger
      // writes a `subtask_added` row against the parent, so the parent's
      // history is stale the moment this returns. A no-op when the tab is
      // closed.
      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(serverTodo.parent_id ?? undefined),
      });
    },
  });

  // The id is minted here rather than in `onMutate`, for the reason
  // `useAddTodo` records: `mutationFn` needs it too, and `onMutate` cannot add
  // to the variables it was given.
  const mutate = (variables: AddSubtaskVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
