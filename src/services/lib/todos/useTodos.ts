import { useQuery } from "@tanstack/react-query";
import { fetchTodos } from "../../api/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useAuth } from "../auth/useAuth";

export function useTodos() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.todos(),
    // `enabled` already stops this running without a user; the guard is what
    // proves that to the compiler, replacing a non-null assertion.
    queryFn: () => {
      if (!userId) throw new Error("useTodos ran without an authenticated user");
      return fetchTodos(userId);
    },
    enabled: Boolean(userId),
    // staleTime: 1000 * 60 * 5, //5 min
  });
}

