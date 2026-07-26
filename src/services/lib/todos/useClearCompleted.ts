import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearCompleted } from "../../api/todoApi";

export function useClearCompleted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearCompleted,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["todos"],
      });
    },
  });
}