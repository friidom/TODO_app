import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo, moveTodo, reorderTodos } from "./todoApi";
import { applyTodoConfirmed, applyTodoInserted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "../../types/data";
import { useBoardId } from "@/hooks/useBoardId";
import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import { isGenuineSubtask } from "./subtasks";
import { rankForAppend, rankForDrop } from "@/utils/rank";

interface AddTodoVars {
  title: string;
  column_id: string;
  /** Gap index to insert at. Appends to the column when omitted. */
  index?: number;
  /**
   * Chosen in the create form, before the row existed. Both default to null,
   * so a card created without touching either control behaves exactly as it
   * did before these were added.
   */
  assignee_id?: string | null;
  /**
   * Sent only by the timeline, which is the one surface that draws a whole
   * range before the card exists (M20-B). Null everywhere else, so every other
   * create path behaves exactly as it did.
   */
  start_date?: string | null;
  due_date?: string | null;
  /** Defaults to the column's own default, so untouched behaves as before. */
  type?: string;
  /**
   * The Epic this card belongs to, when it is created from
   * `EpicTasksSection`'s "New task" flow (M28-A). Null everywhere else — a
   * card made from the column's own create form or the header's quick-add
   * has no Epic to inherit, exactly as it had no assignee or due date to
   * inherit before this field existed.
   *
   * Unlike a Subtask (`useAddSubtask`, a separate mutation entirely), a Task
   * under an Epic is a real board card in a real column — this is the
   * ordinary create path with one more field riding along, not a second one.
   */
  parent_id?: string | null;
}

/** `AddTodoVars` once the hook has stamped the client-minted id on. */
type AddTodoInput = AddTodoVars & { id: string };

export function useAddTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  const mutation = useMutation({
    mutationFn: ({
      id,
      title,
      column_id,
      assignee_id = null,
      start_date = null,
      due_date = null,
      type = DEFAULT_WORK_TYPE,
      parent_id = null,
    }: AddTodoInput) => {
      if (!boardId) throw new Error("useAddTodo ran without a board");

      return addTodo({
        id,
        title,
        column_id,
        board_id: boardId,
        assignee_id,
        start_date,
        due_date,
        type,
        parent_id,
      });
    },

    //!? Optimistic update

    onMutate: async ({
      id,
      title,
      column_id,
      index,
      assignee_id = null,
      start_date = null,
      due_date = null,
      type = DEFAULT_WORK_TYPE,
      parent_id = null,
    }) => {
      // A todo cannot exist without a board — `board_id` is NOT NULL as of
      // M2-07. Refusing here states that requirement instead of inventing a
      // value for it. onMutate runs before mutationFn, so this fails the
      // mutation before anything is written to the cache or sent, which is
      // strictly earlier than the equivalent guard in mutationFn.
      if (!boardId) throw new Error("useAddTodo ran without a board");

      //before request
      //stop all queries
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos(boardId),
      });

      //previous Todos
      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      // Not a placeholder any more: this carries the id the row will really
      // have, so the server's answer reconciles onto the same card rather than
      // replacing it.
      // Where the card will sit under the rank ordering (M6-A). `addTodo`
      // always appends server-side, so a card created at a chosen gap keeps
      // this value through `applyTodoConfirmed` and the correction below writes
      // it back — the same slot-keeping the dense position already did.
      // Visible cards only (M27, widened for Epics in M28-A). The cache
      // holds Subtasks too, and a Subtask carries a real `column_id` — so
      // without the second predicate the optimistic rank would be computed
      // against rows that are not on the board, and a new card could land
      // above or below a neighbour nobody can see. A Task under an Epic is
      // NOT excluded here: it is a real card in this same column, and a
      // plain `parent_id === null` check would wrongly treat it the same as
      // a hidden Subtask — `isGenuineSubtask` is the fix, asking "is the
      // parent a Task", not "is there a parent at all".
      const destination = previousTodos.filter(
        (todo) =>
          todo.column_id === column_id &&
          !isGenuineSubtask(previousTodos, todo),
      );

      const optimisticRank =
        rankForDrop(destination, index ?? destination.length) ??
        // Exhausted: appending is always available and is what the server would
        // have done anyway, so the card lands somewhere real rather than
        // failing a create over a full gap.
        rankForAppend(destination);

      const optimisticTodo: Todo = {
        id,
        title,
        created_at: new Date().toISOString(),
        position: 0, //renumbered below
        rank: optimisticRank,
        column_id,
        board_id: boardId,
        // Allocated by the M2-21 trigger, so the client cannot know it yet.
        // The card renders without its key until the server answers.
        board_key: null,
        // Carried from the create form rather than hard-coded null, so the
        // optimistic card shows its assignee and due date immediately — the
        // server row replaces both on success with the same values.
        assignee_id,
        type,
        priority: null,
        // No create surface sets an estimate; the field is set from the
        // detail panel after the card exists (M24).
        estimate: null,
        // Null for every ordinary card. Set only by `EpicTasksSection`'s
        // "New task" flow (M28-A) — a Task under an Epic is still a real
        // card in this same column, unlike a Subtask, which is created by
        // the separate `useAddSubtask` mutation precisely because IT has no
        // place in this column's dense-position sequence at all.
        parent_id,
        // Carried, since M20-B. It is still null from every other create
        // surface — the column's create card and the header form ask for a due
        // date and nothing asks for a start, so a card made there is a point on
        // the timeline until someone gives it a range. What changed is that
        // there is now one surface where the range *is* the gesture: drawing a
        // bar on the axis supplies both ends before the row exists, and
        // carrying them here is what makes the new bar appear at the range that
        // was drawn rather than jumping there when the server answers.
        start_date,
        due_date,
        updated_at: null,
      };

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applyTodoInserted(previousTodos, optimisticTodo, index),
      );

      //context
      return { previousTodos };
    },

    //error
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(
        queryKeys.todos(boardId),
        context?.previousTodos,
      );
    },

    //success
    onSuccess: (serverTodo) => {
      const current =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const todos = applyTodoConfirmed(current, serverTodo);

      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), todos);

      //the slot we kept; the server just appended
      const kept = todos.find((todo) => todo.id === serverTodo.id);
      const position = kept?.position ?? serverTodo.position;
      const rank = kept?.rank ?? serverTodo.rank;

      if (position === serverTodo.position && rank === serverTodo.rank) return;

      // Unreachable without a board — mutationFn would have thrown before
      // this ran — but the compiler cannot see that, and a non-null assertion
      // is not allowed here.
      if (!boardId) return;

      // The rank half of the correction, and it is a single-row write (M6-04):
      // the card was created at a gap, the server appended it, so move it to
      // the gap. `column_id` comes from the server row, which is the column the
      // insert actually landed in.
      if (rank !== null && rank !== serverTodo.rank && serverTodo.column_id) {
        moveTodo({
          id: serverTodo.id,
          boardId,
          columnId: serverTodo.column_id,
          rank,
        }).catch(() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) }),
        );
      }

      if (position === serverTodo.position) return;

      // Inserted mid-column, so every card below it shifted — write that back.
      // Still-pending inserts are included now: their ids are real, and
      // `addTodo` upserts, so whichever write lands first the row ends up
      // complete. Before M2-14 they had to be filtered out, because upserting
      // a `Date.now()` id would have created a blank row that nothing owned.
      reorderTodos(
        // Visible cards only, matching the optimistic filter above (M27,
        // widened for Epics in M28-A). A genuine Subtask has no place in the
        // board's dense position sequence; a Task under an Epic does, since
        // it is a real card in this column.
        todos.filter(
          (todo) =>
            todo.column_id === serverTodo.column_id &&
            !isGenuineSubtask(todos, todo),
        ),
        boardId,
      ).catch(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) }),
      );
    },
  });

  // The id is minted here rather than in `onMutate` because it has to reach
  // `mutationFn` too, and context flows only forward to the callbacks — both
  // receive the same variables, and `onMutate` cannot add to them.
  const mutate = (variables: AddTodoVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
