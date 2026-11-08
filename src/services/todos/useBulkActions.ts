import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import i18n from "@/components/i18n";
import type { TodoFields } from "@/hooks/useTodoPatch";
import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { toast } from "@/stores/toasts";
import type { Todo } from "@/types/data";
import type { FieldPatch, StatusMove } from "./bulk";
import { applyTodoMoved, applyTodoPatched } from "./cache";
import { addLabel, deleteTodo, moveTodo, updateTodo } from "./todoApi";

// a handful at a time, so a hundred rows are not a hundred simultaneous requests
const WIDTH = 4;

async function settle<T>(
  items: T[],
  send: (item: T) => Promise<unknown>,
): Promise<number> {
  let failed = 0;

  for (let i = 0; i < items.length; i += WIDTH) {
    const results = await Promise.allSettled(
      items.slice(i, i + WIDTH).map(send),
    );

    failed += results.filter((result) => result.status === "rejected").length;
  }

  return failed;
}

export type BulkKind = "status" | "edit" | "delete";

interface EditItem {
  todo: Todo;
  patch?: TodoFields;
  label?: boolean;
}

// One optimistic write for the whole selection, then the requests, then a
// refetch. Not N single-row mutations: each of those snapshots the board for
// its own rollback, and N of them restoring at once would overwrite each other.
export function useBulkActions() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const [pending, setPending] = useState<BulkKind | null>(null);

  async function run<T>(
    kind: BulkKind,
    items: T[],
    optimistic: (rows: Todo[]) => Todo[],
    send: (item: T) => Promise<unknown>,
    succeeded: (count: number) => string,
  ): Promise<boolean> {
    if (!boardId || items.length === 0) return true;

    const key = queryKeys.todos(boardId);

    setPending(kind);

    try {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<Todo[]>(key, (rows) => rows && optimistic(rows));

      const failed = await settle(items, send);

      // refetched rather than patched: the server's answer is right for every
      // row, including the ones that failed and need their old values back
      await queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["todo"] });

      if (failed > 0) {
        toast.error(i18n.t("bulk.failed", { failed, count: items.length }));
      } else {
        toast.success(succeeded(items.length));
      }

      return failed === 0;
    } finally {
      setPending(null);
    }
  }

  function changeStatus(moves: StatusMove[]) {
    return run(
      "status",
      moves,
      (rows) =>
        moves.reduce(
          (acc, move) =>
            applyTodoMoved(acc, move.todo, move.statusId, move.rank),
          rows,
        ),
      (move) =>
        moveTodo({
          id: move.todo.id,
          boardId: boardId!,
          statusId: move.statusId,
          rank: move.rank,
        }),
      (count) => i18n.t("bulk.updated", { count }),
    );
  }

  function editFields(
    plan: { patches: FieldPatch[]; labels: Todo[] },
    label?: string,
  ) {
    const byId = new Map<string, EditItem>();

    for (const { todo, patch } of plan.patches)
      byId.set(todo.id, { todo, patch });

    for (const todo of plan.labels) {
      byId.set(todo.id, { ...(byId.get(todo.id) ?? { todo }), label: true });
    }

    return run(
      "edit",
      [...byId.values()],
      (rows) =>
        plan.patches.reduce(
          (acc, { todo, patch }) =>
            applyTodoPatched(acc, todo.id, patch as Partial<Todo>),
          rows,
        ),
      async ({ todo, patch, label: adds }) => {
        if (patch) {
          await updateTodo({ id: todo.id, board_id: todo.board_id, ...patch });
        }

        if (adds && label) await addLabel(todo.id, label);
      },
      (count) => i18n.t("bulk.updated", { count }),
    );
  }

  function remove(roots: Todo[], removed: ReadonlySet<string>) {
    return run(
      "delete",
      roots,
      (rows) => rows.filter((todo) => !removed.has(todo.id)),
      async (todo) => {
        await deleteTodo(todo.id);
        queryClient.removeQueries({
          queryKey: queryKeys.todo(todo.id),
          exact: true,
        });
      },
      (count) => i18n.t("bulk.deleted", { count }),
    );
  }

  return { pending, changeStatus, editFields, remove };
}
