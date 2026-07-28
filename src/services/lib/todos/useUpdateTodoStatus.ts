import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodoStatus } from "../../api/todoApi";

export function useUpdateTodoStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: "todo" | "in_progress" | "completed" | "rejected";
    }) => updateTodoStatus(id, status),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["todos"],
      });
    },
  });
}
