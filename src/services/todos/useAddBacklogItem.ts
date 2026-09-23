import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useSprints } from "@/services/sprints/useSprints";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";
import { backlogRankForAppend } from "@/utils/backlogRank";
import type { IColumn, Sprint, Todo } from "@/types/data";
import { applySubtaskInserted, applyTodoUpdated } from "./cache";
import { boardEntryOnActiveSprint } from "./backlog";
import { addBacklogItem } from "./todoApi";

// shared by mutationFn and onMutate so the write and the optimistic row can't disagree about whether this lands on the board
function boardEntryFor(
  sprintId: string | null,
  sprints: Sprint[],
  columns: IColumn[],
  todos: Todo[],
) {
  const activeSprintId = activeSprintIdOf(sprints);

  if (sprintId === null || sprintId !== activeSprintId) return null;

  return boardEntryOnActiveSprint(columns, todos);
}

export interface AddBacklogItemVars {
  title: string;
  type?: string;
  sprintId?: string | null;
}

export function useAddBacklogItem() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const { data: columns = [] } = useColumns();
  const { data: sprints = [] } = useSprints();

  const mutation = useMutation({
    mutationFn: ({
      id,
      title,
      type = DEFAULT_WORK_TYPE,
      sprintId = null,
    }: AddBacklogItemVars & { id: string }) => {
      if (!boardId) throw new Error("useAddBacklogItem ran without a board");

      const todos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const section = todos.filter((todo) => todo.sprint_id === sprintId);
      const entry = boardEntryFor(sprintId, sprints, columns, todos);

      return addBacklogItem({
        id,
        title,
        board_id: boardId,
        type,
        sprint_id: sprintId,
        backlog_rank: backlogRankForAppend(section),
        column_id: entry?.column_id ?? null,
        rank: entry?.rank ?? null,
      });
    },

    onMutate: async ({
      id,
      title,
      type = DEFAULT_WORK_TYPE,
      sprintId = null,
    }) => {
      if (!boardId) throw new Error("useAddBacklogItem ran without a board");

      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const section = previousTodos.filter(
        (todo) => todo.sprint_id === sprintId,
      );
      const entry = boardEntryFor(sprintId, sprints, columns, previousTodos);

      const optimisticTodo: Todo = {
        id,
        title,
        board_id: boardId,
        column_id: entry?.column_id ?? null,
        position: null,
        rank: entry?.rank ?? null,
        backlog_rank: backlogRankForAppend(section),
        creator_id: null,
        completed_at: null,
        board_key: null,
        type,
        priority: null,
        assignee_id: null,
        estimate: null,
        parent_id: null,
        sprint_id: sprintId,
        start_date: null,
        due_date: null,
        created_at: new Date().toISOString(),
        updated_at: null,
      };

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applySubtaskInserted(previousTodos, optimisticTodo),
      );

      return { previousTodos };
    },

    onError: (_err, _vars, context) => {
      if (!context) return;

      queryClient.setQueryData(queryKeys.todos(boardId), context.previousTodos);
    },

    onSuccess: (serverTodo) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old = []) =>
        applyTodoUpdated(old, serverTodo),
      );
    },
  });

  // minted here, not in onMutate — it has to reach mutationFn too
  const mutate = (variables: AddBacklogItemVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
