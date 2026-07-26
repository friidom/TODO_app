import { useQuery } from "@tanstack/react-query";
import { fetchTodos } from "../../api/todoApi";
import { useAuth } from "../auth/useAuth";

export function useTodos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["todos"],
    queryFn: () => fetchTodos(user?.id!),
    enabled: Boolean(user?.id),
    // staleTime: 1000 * 60 * 5, //5 min
  });
}

