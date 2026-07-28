import type { ISupabaseTodo } from "../../../types/data";
import { toggleTodo } from "../../api/todoApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useToggleTodo() {
  const queryClient = useQueryClient();

  //? Optimistic Update
  return useMutation({
    mutationFn: toggleTodo,

    onMutate: async (todo) => {
      await queryClient.cancelQueries({
        queryKey: ["todos"],
      });

      const previousTodos = queryClient.getQueryData<ISupabaseTodo[]>([
        "todos",
      ]);

      queryClient.setQueryData<ISupabaseTodo[]>(["todos"], (old = []) => {
        const completed = !todo.completed;

        return old.map((t) => {
          if (t.id === todo.id) {
            return {
              ...t,
              completed,
              status: completed ? "completed" : (t.previous_status ?? "todo"),
              previous_status: completed ? t.status : null,
              position: completed
                ? 0
                : old.filter(
                    (x) =>
                      x.status === (t.previous_status ?? "todo") &&
                      x.id !== t.id,
                  ).length,
            };
          }

          // Когда задача становится completed —
          // сдвигаем остальные completed вниз.
          if (completed && t.status === "completed") {
            return {
              ...t,
              position: t.position + 1,
            };
          }
          if (!completed && t.status === "completed") {
            return {
              ...t,
              position:
                t.position > todo.position ? t.position - 1 : t.position,
            };
          }
          return t;
        });
      });

      return { previousTodos };
    },

    onError: (_error, _todo, context) => {
      queryClient.setQueryData(["todos"], context?.previousTodos);
    },

    onSuccess: () => {
      // ничего
    },
  });
}
