import { queryClient } from "@/services/queryClient/queryClient";
import { reorderTodos } from "@/services/api/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { ISupabaseTodo } from "@/types/data";
import { byPosition } from "../position";

interface DropIndicator {
  columnId: string | null;
  index: number;
}

export async function todoDrop(
  todos: ISupabaseTodo[],
  activeTodo: ISupabaseTodo,
  indicator: DropIndicator,
) {
  if (!indicator.columnId) return;

  // удаляем перетаскиваемую карточку
  const remaining = todos.filter((t) => t.id !== activeTodo.id);

  // колонка назначения
  const destination = remaining
    .filter((t) => t.column_id === indicator.columnId)
    .sort(byPosition);

  // остальные колонки
  const others = remaining.filter((t) => t.column_id !== indicator.columnId);

  // вставляем карточку по синей линии
  destination.splice(indicator.index, 0, {
    ...activeTodo,
    column_id: indicator.columnId,
  });

  // пересчитываем позиции
  destination.forEach((todo, index) => {
    todo.position = index;
  });

  // пересчитываем позиции в старой колонке
  const source = others
    .filter((t) => t.column_id === activeTodo.column_id)
    .sort(byPosition);

  source.forEach((todo, index) => {
    todo.position = index;
  });

  const updated = [
    ...others.filter((t) => t.column_id !== activeTodo.column_id),
    ...source,
    ...destination,
  ];

  queryClient.setQueryData(queryKeys.todos(), updated);

  await reorderTodos(updated);
}
