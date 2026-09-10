import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo, moveTodo, reorderTodos } from "./todoApi";
import { applyTodoConfirmed, applyTodoInserted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "../../types/data";
import { useBoardId } from "@/hooks/useBoardId";
import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import { isGenuineSubtask } from "./subtasks";
import { rankForAppend, rankForDrop } from "@/utils/rank";
import { useSprints } from "@/services/sprints/useSprints";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";

interface AddTodoVars {
  title: string;
  column_id: string;
  /** Gap index to insert at. Appends to the column when omitted. */
  index?: number;
  assignee_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  type?: string;
  parent_id?: string | null;
  // undefined = "use the active sprint"; null = "deliberately none". Don't collapse these.
  sprint_id?: string | null;
}

type AddTodoInput = AddTodoVars & { id: string };

// Sprint is read here, not passed by callers, so every create path lands in the running sprint without each one remembering to say so.
export function useAddTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  const { data: sprints = [] } = useSprints();
  const activeSprintId = activeSprintIdOf(sprints);

  const mutation = useMutation({
    mutationFn: ({
      id,
      title,
      column_id,
      assignee_id = null,
      start_date = null,
      due_date = null,
      type = DEFAULT_WORK_TYPE,
      parent_id = null,
      sprint_id,
    }: AddTodoInput) => {
      if (!boardId) throw new Error("useAddTodo ran without a board");

      return addTodo({
        id,
        title,
        column_id,
        board_id: boardId,
        assignee_id,
        start_date,
        due_date,
        type,
        parent_id,
        sprint_id: sprint_id === undefined ? activeSprintId : sprint_id,
      });
    },

    onMutate: async ({
      id,
      title,
      column_id,
      index,
      assignee_id = null,
      start_date = null,
      due_date = null,
      type = DEFAULT_WORK_TYPE,
      parent_id = null,
      sprint_id,
    }) => {
      if (!boardId) throw new Error("useAddTodo ran without a board");

      await queryClient.cancelQueries({
        queryKey: queryKeys.todos(boardId),
      });

      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      // isGenuineSubtask, not a plain parent_id check — a Task under an Epic is a real card in this column, unlike a Subtask.
      const destination = previousTodos.filter(
        (todo) =>
          todo.column_id === column_id &&
          !isGenuineSubtask(previousTodos, todo),
      );

      const optimisticRank =
        rankForDrop(destination, index ?? destination.length) ??
        rankForAppend(destination);

      const optimisticTodo: Todo = {
        id,
        title,
        created_at: new Date().toISOString(),
        position: 0,
        rank: optimisticRank,
        column_id,
        board_id: boardId,
        board_key: null,
        assignee_id,
        type,
        priority: null,
        estimate: null,
        parent_id,
        start_date,
        due_date,
        updated_at: null,
        sprint_id: sprint_id === undefined ? activeSprintId : sprint_id,
        backlog_rank: null,
      };

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applyTodoInserted(previousTodos, optimisticTodo, index),
      );

      return { previousTodos };
    },

    onError: (_err, _variables, context) => {
      queryClient.setQueryData(
        queryKeys.todos(boardId),
        context?.previousTodos,
      );
    },

    onSuccess: (serverTodo) => {
      const current =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const todos = applyTodoConfirmed(current, serverTodo);

      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), todos);

      const kept = todos.find((todo) => todo.id === serverTodo.id);
      const position = kept?.position ?? serverTodo.position;
      const rank = kept?.rank ?? serverTodo.rank;

      if (position === serverTodo.position && rank === serverTodo.rank) return;

      if (!boardId) return;

      if (rank !== null && rank !== serverTodo.rank && serverTodo.column_id) {
        moveTodo({
          id: serverTodo.id,
          boardId,
          columnId: serverTodo.column_id,
          rank,
        }).catch(() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) }),
        );
      }

      if (position === serverTodo.position) return;

      reorderTodos(
        todos.filter(
          (todo) =>
            todo.column_id === serverTodo.column_id &&
            !isGenuineSubtask(todos, todo),
        ),
        boardId,
      ).catch(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) }),
      );
    },
  });

  // Minted here, not in onMutate, because mutationFn needs it too and context only flows forward to the callbacks.
  const mutate = (variables: AddTodoVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
