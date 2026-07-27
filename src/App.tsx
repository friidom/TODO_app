import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useTodos } from "./services/lib";
import TodoList from "./components/todo/TodoList";
import { useAddTodo } from "./services/lib/index";
import "./styles/global.css";
import Layout from "./components/layout/Layout";
import TodoForm from "./components/todo/TodoForm";
import { supabase } from "./services/api/supabase";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { useAuth } from "./services/lib/auth/useAuth";
import TodoPage from "./components/pages/TodoPage";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { useReorderTodos } from "./services/lib/todos/useReorderTodos";
import { cn } from "./services/lib/utils";
import { filters } from "./constants/consants";
import { useClearCompleted } from "./services/lib/index";
import Loading from "./components/pages/loading/LoadingPage";

function App() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null!);
  //!Quary Todos//
  const addTodoMutation = useAddTodo();
  const { data: todos, isLoading, error } = useTodos();
  const { user, loading } = useAuth();
  const clearCompletedMutation = useClearCompleted();
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

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
  const reorderTodos = useReorderTodos();

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

  //! Sorting
  const filteredTodos = (todos ?? []).filter((todo) => {
    switch (filter) {
      case "active":
        return !todo.completed;

      case "completed":
        return todo.completed;

      default:
        return true;
    }
  });

  if (isLoading) return <Loading />;

  if (error) return <p>{error.message}</p>;

  return (
    <TodoPage>
      {/* <Loading /> */}
      <Layout>
        
        <h1 className="text-4xl text-center mb-4">TODO</h1>
        <TodoForm
          value={value}
          handleAddTodo={handleAddTodo}
          handleKeyDown={handleKeyDown}
          handleOnChange={handleOnChange}
          ref={inputRef}
          className="mb-4 flex items-center gap-2 rounded-xl bg-red-200 py-3 pl-3 pr-5 shadow-md md:py-4"
        />
        {/* //! drag and drop  */}
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={reorderTodos}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <TodoList todos={filteredTodos} />

          {/* //! stats */}

          <div className="flex items-center bg-red-200 shadow-lg justify-between gap-2 rounded-b-md border-clr-todo-borders bg-red-100 px-4 py-3 text-sm text-gray-500">
            <p className="">{todos?.length} items left</p>
            <div className="flex gap-2 py-2 ">
              {filters.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "cursor-pointer transition-colors duration-150",
                    filter === key
                      ? "font-semibold text-blue-500"
                      : "text-gray-500 hover:text-gray-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              className="cursor-pointer transition-colors duration-150 text-gray-500 hover:text-red-500"
              onClick={() => {
                clearCompletedMutation.mutate(user!.id);
              }}
            >
              Clear Completed
            </button>
          </div>
        </DndContext>
      </Layout>
    </TodoPage>
  );
}

export default App;
