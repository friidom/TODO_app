import { useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragOverEvent } from "@dnd-kit/core";
import type { ISupabaseTodo } from "../../../types/data";

export function useDragOverTodos() {
  const queryClient = useQueryClient();

  return ({ active, over }: DragOverEvent) => {
    if (!over) return;
    //get todos
    const todos = queryClient.getQueryData<ISupabaseTodo[]>(["todos"]) ?? [];

    //active todo which is dragging
    const activeTodo = todos.find((t) => t.id === active.id);

    if (!activeTodo) return;

    //over todo which is under active
    const overTodo = todos.find((t) => t.id === over.id);

    //if column is empty or not
    const overStatus = overTodo
      ? overTodo.status
      : (over.id as ISupabaseTodo["status"]);

    //?! if same column
    if (activeTodo.status === overStatus) {
      const sameColumn = todos.filter((t) => t.status === activeTodo.status);

      const oldIndex = sameColumn.findIndex((t) => t.id === active.id);

      const newIndex = sameColumn.findIndex((t) => t.id === over.id);

      if (oldIndex === newIndex || newIndex === -1) return;

      //reorders index and change position
      const reordered = arrayMove(sameColumn, oldIndex, newIndex).map(
        (todo, index) => ({
          ...todo,
          position: index,
        }),
      );

      //other todos on that same column
      const others = todos.filter((t) => t.status !== activeTodo.status);

      //set new todos
      queryClient.setQueryData(["todos"], [...others, ...reordered]);

      return;
    }

    //?! if not the same column

    // from
    const source = todos.filter(
      (t) => t.status === activeTodo.status && t.id !== activeTodo.id,
    );

    // to
    const destination = todos.filter((t) => t.status === overStatus);

    // active todo + new status
    const moved = {
      ...activeTodo,
      status: overStatus,
    };

    const overIndex = destination.findIndex((t) => t.id === over.id);

    //pushing inside
    if (overIndex === -1) {
      destination.push(moved);
    } else {
      destination.splice(overIndex, 0, moved);
    }

    const updatedSource = source.map((todo, index) => ({
      ...todo,
      position: index,
    }));

    const updatedDestination = destination.map((todo, index) => ({
      ...todo,
      position: index,
    }));

    const others = todos.filter(
      (t) => t.status !== activeTodo.status && t.status !== overStatus,
    );

    queryClient.setQueryData(
      ["todos"],
      [...others, ...updatedSource, ...updatedDestination],
    );
  };
}
