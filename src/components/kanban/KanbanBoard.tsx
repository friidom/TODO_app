import useKanbanDnd from "@/hooks/useKanbanDnd";
import { useState } from "react";

import { DndContext, pointerWithin } from "@dnd-kit/core";

import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

import SortableColumn from "./SortableColumn";
import { arrayMove } from "@dnd-kit/sortable";
import { useReorderColumns } from "@/services/columns/useReorderColumns";
import useTodosByColumns from "@/hooks/useTodosByColumns";
import AddColumnButton from "../columns/AddColumnButton";
import TodoDragOverlay from "./TodoDragOverlay";
import { t } from "i18next";

import { queryClient } from "@/services/queryClient/queryClient";
import { useTodos } from "@/services/lib/todos/useTodos";
import { todoDrop } from "@/services/lib/todos/useTodoDrop";
import Loading from "../pages/loading/LoadingPage";



export default function KanbanBoard() {
  const { data: todos = [], isLoading, error } = useTodos();
  //   const [isDragging, setIsDragging] = useState(false);
  const [isDraggingTodo, setIsDraggingTodo] = useState(false);
  const {
    sensors,
    handleDragOver,
    activeTodo,
    setActiveTodo,
    indicator,
  } = useKanbanDnd();



  const reorderColumns = useReorderColumns();
  const { todosByColumn, columns } = useTodosByColumns();
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [createColumnOpen, setCreateColumnOpen] = useState(false);

  if (isLoading) return <Loading />;

  if (error) return <p>{error.message}</p>;
  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(event) => {
          setIsDraggingTodo(true);
          const todo = todos?.find((t) => t.id === event.active.id);

          if (todo) {
            setActiveTodo(todo);
          }
        }}
        onDragOver={handleDragOver}

        onDragEnd={async (event) => {
          setIsDraggingTodo(false);
          const { active, over } = event;

          if (!over) return;

          const activeColumn = columns.find((c) => c.id === active.id);
          const overColumn = columns.find((c) => c.id === over.id);

          if (activeColumn && overColumn) {
            const oldIndex = columns.findIndex((c) => c.id === active.id);
            const newIndex = columns.findIndex((c) => c.id === over.id);

            const reordered = arrayMove(columns, oldIndex, newIndex).map(
              (column, index) => ({
                ...column,
                position: index,
              }),
            );

            queryClient.setQueryData(["columns"], reordered);

            reorderColumns.mutate(reordered);

            return;
          }
          if (activeTodo) {
            await todoDrop(todos, activeTodo, indicator);
          }

          setActiveTodo(null);
        }}
        onDragCancel={() => {
          setIsDraggingTodo(false);
          setActiveTodo(null);
        }}
        collisionDetection={pointerWithin}
      >
        <div className="h-full overflow-x-auto">
          <div className="flex min-w-max gap-5 px-6 pb-6">
            <SortableContext
              items={columns.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-full min-w-max gap-5">
                {columns
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((column) => (
                    <SortableColumn
                      key={column.id}
                      id={column.id}
                      column={column}
                      openMenuId={openMenuId}
                      setOpenMenuId={setOpenMenuId}
                      headerTitle={t(column.title)}
                      todos={todosByColumn[column.id] ?? []}
                    />
                  ))}
              </div>
            </SortableContext>

            <AddColumnButton setCreateColumnOpen={setCreateColumnOpen} />
          </div>
        </div>

        {/* <DragOverlay /> */}
        <TodoDragOverlay activeTodo={activeTodo} />
      </DndContext>
    </>
  );
}
