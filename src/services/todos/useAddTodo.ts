import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo, reorderTodos } from "./todoApi";
import { applyTodoConfirmed, applyTodoInserted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { ISupabaseTodo } from "../../types/data";
import { useBoardId } from "@/hooks/useBoardId";
import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";

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
  due_date?: string | null;
  /** Defaults to the column's own default, so untouched behaves as before. */
  type?: string;
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
      due_date = null,
      type = DEFAULT_WORK_TYPE,
    }: AddTodoInput) => {
      if (!boardId) throw new Error("useAddTodo ran without a board");

      return addTodo({
        id,
        title,
        column_id,
        board_id: boardId,
        assignee_id,
        due_date,
        type,
      });
    },

    //!? Optimistic update

    onMutate: async ({
      id,
      title,
      column_id,
      index,
      assignee_id = null,
      due_date = null,
      type = DEFAULT_WORK_TYPE,
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
        queryClient.getQueryData<ISupabaseTodo[]>(queryKeys.todos(boardId)) ??
        [];

      // Not a placeholder any more: this carries the id the row will really
      // have, so the server's answer reconciles onto the same card rather than
      // replacing it.
      const optimisticTodo: ISupabaseTodo = {
        id,
        title,
        created_at: new Date().toISOString(),
        position: 0, //renumbered below
        column_id,
        // Dead columns kept by the schema; the server row replaces this
        // placeholder on success, so null is never persisted from here.
        status: null,
        previous_status: null,
        // Added by M2-02 and M2-03. Mirrors what the server produces for a
        // fresh insert: `archived` has a false default, the rest have none.
        board_id: boardId,
        // Allocated by the M2-21 trigger, so the client cannot know it yet.
        // The card renders without its key until the server answers.
        board_key: null,
        creator_id: null,
        // Carried from the create form rather than hard-coded null, so the
        // optimistic card shows its assignee and due date immediately — the
        // server row replaces both on success with the same values.
        assignee_id,
        type,
        description: null,
        priority: null,
        due_date,
        estimate: null,
        archived: false,
        updated_at: null,
      };

      queryClient.setQueryData<ISupabaseTodo[]>(
        queryKeys.todos(boardId),
        applyTodoInserted(previousTodos, optimisticTodo, index),
      );

      //context
      return { previousTodos };
    },

    //error
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(queryKeys.todos(boardId), context?.previousTodos);
    },

    //success
    onSuccess: (serverTodo) => {
      const current =
        queryClient.getQueryData<ISupabaseTodo[]>(queryKeys.todos(boardId)) ??
        [];

      const todos = applyTodoConfirmed(current, serverTodo);

      queryClient.setQueryData<ISupabaseTodo[]>(queryKeys.todos(boardId), todos);

      //the slot we kept; the server just appended
      const position =
        todos.find((todo) => todo.id === serverTodo.id)?.position ??
        serverTodo.position;

      if (position === serverTodo.position) return;

      // Unreachable without a board — mutationFn would have thrown before
      // this ran — but the compiler cannot see that, and a non-null assertion
      // is not allowed here.
      if (!boardId) return;

      // Inserted mid-column, so every card below it shifted — write that back.
      // Still-pending inserts are included now: their ids are real, and
      // `addTodo` upserts, so whichever write lands first the row ends up
      // complete. Before M2-14 they had to be filtered out, because upserting
      // a `Date.now()` id would have created a blank row that nothing owned.
      reorderTodos(
        todos.filter((todo) => todo.column_id === serverTodo.column_id),
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
