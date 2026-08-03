import { queryClient } from "@/services/queryClient/queryClient";
import { reorderTodos } from "@/services/api/todoApi";
import type { ISupabaseTodo } from "@/types/data";

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
    .sort((a, b) => a.position - b.position);

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
    .sort((a, b) => a.position - b.position);

  source.forEach((todo, index) => {
    todo.position = index;
  });

  const updated = [
    ...others.filter((t) => t.column_id !== activeTodo.column_id),
    ...source,
    ...destination,
  ];

  queryClient.setQueryData(["todos"], updated);

  await reorderTodos(updated);
}
