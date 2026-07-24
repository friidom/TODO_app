import { useQuery } from "@tanstack/react-query";
import { fetchTodos } from "../../api/todoApi";

export function useTodos() {
  return useQuery({
    queryKey: ["todos"],
    queryFn: fetchTodos,
    staleTime: 1000 * 60 * 60 * 24,
    // staleTime: 1000 * 60 * 5, //5 min
  });
}

// TODO: TAILWIND !!!