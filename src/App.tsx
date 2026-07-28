import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useTodos } from "./services/lib";
import { useTranslation } from "react-i18next";
import { useAddTodo } from "./services/lib/index";
import "./styles/global.css";
import Layout from "./components/layout/Layout";
import TodoForm from "./components/todo/TodoForm";
import { supabase } from "./services/api/supabase";
import { closestCenter, DndContext, pointerWithin } from "@dnd-kit/core";

import TodoPage from "./components/pages/TodoPage";

import { useReorderTodos } from "./services/lib/todos/useReorderTodos";

import { DragOverlay } from "@dnd-kit/core";
import { useClearCompleted } from "./services/lib/index";
import Loading from "./components/pages/loading/LoadingPage";
import { columns } from "./constants/columns";

import KanbanColumn from "./components/kanban/KanbanColumn";
import { useDragOverTodos } from "./services/lib/todos/useDragOverTodos";
import TodoItem from "./components/todo/TodoItem";

function App() {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null!);
  const [activeId, setActiveId] = useState<string | null>(null);

  //!Quary Todos//
  const addTodoMutation = useAddTodo();
  const { data: todos, isLoading, error } = useTodos();

  const activeTodo = todos?.find((t) => t.id === activeId) ?? null;

  const groupedTodos = {
    todo:
      todos
        ?.filter((t) => t.status === "todo")
        .sort((a, b) => a.position - b.position) ?? [],

    in_progress:
      todos
        ?.filter((t) => t.status === "in_progress")
        .sort((a, b) => a.position - b.position) ?? [],

    completed:
      todos
        ?.filter((t) => t.status === "completed")
        .sort((a, b) => a.position - b.position) ?? [],

    rejected:
      todos
        ?.filter((t) => t.status === "rejected")
        .sort((a, b) => a.position - b.position) ?? [],
  };
  console.log(
    groupedTodos.todo.map((t) => ({
      id: t.id,
      pos: t.position,
    })),
  );
  // console.log(columns.map((column) =>groupedTodos[column.id]))

  // const { user, loading } = useAuth();

  const clearCompletedMutation = useClearCompleted();

  //!test
  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      console.log(user);
    }

    getUser();
  }, []);

  //!DRAG AND DROP
  const handleDragEnd = useReorderTodos();
  const handleDragOver = useDragOverTodos();
  // const addTodo = useTodoStore((state) => state.addTodo);

  //! HANDLERS
  const handleOnChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setValue(e.target.value);
  };
  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      handleAddTodo();
    }
  };

  const handleAddTodo = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!value.trim()) return;
    addTodoMutation.mutate(value);

    setValue("");
  };
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  if (isLoading) return <Loading />;

  if (error) return <p>{error.message}</p>;

  return (
    <TodoPage>
      {/* <Loading /> */}
      <Layout>
        <div className="mx-auto mb-8 max-w-2xl">
          <TodoForm
            value={value}
            handleAddTodo={handleAddTodo}
            handleKeyDown={handleKeyDown}
            handleOnChange={handleOnChange}
            ref={inputRef}
            className="bg-card border-app mb-6 flex max-w-2xl items-center justify-center gap-3 rounded-2xl border px-5 py-4 shadow-lg"
          />
        </div>
        {/* //! drag and drop  */}
        <DndContext
          onDragStart={(event) => {
            setActiveId(event.active.id as string);
          }}
          onDragOver={handleDragOver}
          onDragEnd={(event) => {
            setActiveId(null);
            handleDragEnd(event);
          }}
          onDragCancel={() => {
            setActiveId(null);
          }}
          collisionDetection={closestCenter}
        >
          <div className="overflow-x-auto pb-4">
            <div className="flex min-w-max gap-6">
              {columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  id={column.id}
                  title={t(column.id)}
                  todos={groupedTodos[column.id]}
                />
              ))}
            </div>
          </div>
          {/* <DragOverlay /> */}

          <DragOverlay dropAnimation={null} adjustScale={false}>
            {activeTodo && <TodoItem {...activeTodo} overlay />}
          </DragOverlay>
        </DndContext>
      </Layout>
    </TodoPage>
  );
}

export default App;
