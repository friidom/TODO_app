import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo, reorderTodos } from "./todoApi";
import { insertDense } from "./insertDense";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { ISupabaseTodo } from "../../types/data";

interface AddTodoVars {
  title: string;
  column_id: string;
  /** Gap index to insert at. Appends to the column when omitted. */
  index?: number;
}

export function useAddTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ title, column_id }: AddTodoVars) =>
      addTodo({ title, column_id }),

    //!? Optimistic update

    onMutate: async ({ title, column_id, index }) => {
      //before request
      //stop all queries
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos(),
      });

      //previous Todos
      const previousTodos =
        queryClient.getQueryData<ISupabaseTodo[]>(queryKeys.todos()) ?? [];

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
        // board_id stays null because no write path sends it yet — M2-11 is
        // where this becomes the real board, and where a null here would
        // start being wrong.
        board_id: null,
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

      const renumbered = insertDense(
        previousTodos.filter((todo) => todo.column_id === column_id),
        optimisticTodo,
        index,
      );

      queryClient.setQueryData<ISupabaseTodo[]>(queryKeys.todos(), [
        ...previousTodos.filter((todo) => todo.column_id !== column_id),
        ...renumbered,
      ]);

      //context
      return {
        previousTodos,
        optimisticId: optimisticTodo.id,
      };
    },

    //error
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(queryKeys.todos(), context?.previousTodos);
    },

    //success
    onSuccess: (serverTodo, _variables, context) => {
      const current =
        queryClient.getQueryData<ISupabaseTodo[]>(queryKeys.todos()) ?? [];

      //keep the slot we picked; the server just appended
      const position =
        current.find((todo) => todo.id === context?.optimisticId)?.position ??
        serverTodo.position;

      const todos = current.map((todo) =>
        todo.id === context?.optimisticId
          ? { ...serverTodo, position, isOptimistic: false }
          : todo,
      );

      queryClient.setQueryData<ISupabaseTodo[]>(queryKeys.todos(), todos);

      if (position === serverTodo.position) return;

      // Inserted mid-column, so every card below it shifted — write that back.
      // ponytail: still-pending inserts are skipped (upserting their fake ids
      // would create blank rows); their own onSuccess writes the column again.
      reorderTodos(
        todos.filter(
          (todo) =>
            todo.column_id === serverTodo.column_id && !todo.isOptimistic,
        ),
      ).catch(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.todos() }),
      );
    },
  });
}
