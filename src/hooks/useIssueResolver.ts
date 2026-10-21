import { useMemo } from "react";

import { useTodos } from "@/services/todos/useTodos";
import type { IssueTarget } from "@/utils/taskRef";
import { taskKey } from "@/utils/taskKey";
import { useBoardId } from "./useBoardId";
import { useKeyPrefix } from "./useKeyPrefix";

// Keys of the board on screen, answered from the cache it already holds, so a
// link opens the task in place without asking the server. Anything else — another
// board, a deleted card — is left to /tasks/:ref, which checks access first.
export function useIssueResolver(): (key: string) => IssueTarget | null {
  const boardId = useBoardId();
  const keyPrefix = useKeyPrefix();
  const { data: todos } = useTodos();

  return useMemo(() => {
    const ids = new Map<string, string>();

    for (const todo of todos ?? []) {
      const key = taskKey(keyPrefix, todo.board_key);

      if (key) ids.set(key, todo.id);
    }

    return (key: string) => {
      const todoId = ids.get(key);

      return todoId && boardId ? { boardId, todoId } : null;
    };
  }, [boardId, keyPrefix, todos]);
}
