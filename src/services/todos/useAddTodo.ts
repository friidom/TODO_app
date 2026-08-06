import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo, reorderTodos } from "./todoApi";
import { applyTodoConfirmed, applyTodoInserted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { ISupabaseTodo } from "../../types/data";
import { useBoardId } from "@/hooks/useBoardId";

interface AddTodoVars {
  title: string;
  column_id: string;
  /** Gap index to insert at. Appends to the column when omitted. */
  index?: number;
}

export function useAddTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: ({ title, column_id }: AddTodoVars) => {
      if (!boardId) throw new Error("useAddTodo ran without a board");
      return addTodo({ title, column_id, board_id: boardId });
    },

    //!? Optimistic update

    onMutate: async ({ title, column_id, index }) => {
      //before request
      //stop all queries
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos(boardId),
      });

      //previous Todos
      const previousTodos =
        queryClient.getQueryData<ISupabaseTodo[]>(queryKeys.todos(boardId)) ?? [];

      //temp todo
      const optimisticTodo: ISupabaseTodo = {
        id: Date.now(),
        title,
        completed: false,
        user_id: "",
        created_at: new Date().toISOString(),
        position: 0, //renumbered below
        column_id,
        // Dead columns kept by the schema; the server row replaces this
        // placeholder on success, so null is never persisted from here.
        status: null,
        previous_status: null,
        // Added by M2-02 and M2-03. Mirrors what the server produces for a
        // fresh insert: `archived` has a false default, the rest have none.
        // onMutate runs before mutationFn, so this can genuinely be undefined
        // for the one render where the route param has not resolved. null is
        // the honest value; mutationFn then throws before anything is sent.
        board_id: boardId ?? null,
        creator_id: null,
        assignee_id: null,
        description: null,
        priority: null,
        due_date: null,
        estimate: null,
        archived: false,
        updated_at: null,
        isOptimistic: true,
      };

      queryClient.setQueryData<ISupabaseTodo[]>(
        queryKeys.todos(boardId),
        applyTodoInserted(previousTodos, optimisticTodo, index),
      );

      //context
      return {
        previousTodos,
        optimisticId: optimisticTodo.id,
      };
    },

    //error
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(queryKeys.todos(boardId), context?.previousTodos);
    },

    //success
    onSuccess: (serverTodo, _variables, context) => {
      const current =
        queryClient.getQueryData<ISupabaseTodo[]>(queryKeys.todos(boardId)) ?? [];

      const todos = applyTodoConfirmed(
        current,
        context?.optimisticId,
        serverTodo,
      );

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
      // ponytail: still-pending inserts are skipped (upserting their fake ids
      // would create blank rows); their own onSuccess writes the column again.
      reorderTodos(
        todos.filter(
          (todo) =>
            todo.column_id === serverTodo.column_id && !todo.isOptimistic,
        ),
        boardId,
      ).catch(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) }),
      );
    },
  });
}
