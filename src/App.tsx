import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useTodos } from "./services/lib";
import { useTranslation } from "react-i18next";
import "./styles/global.css";
import Layout from "./components/layout/Layout";
import { supabase } from "./services/api/supabase";
import { closestCenter, DndContext, pointerWithin } from "@dnd-kit/core";
import TodoPage from "./components/pages/TodoPage";
import { useReorderTodos } from "./services/lib/todos/useReorderTodos";
import { DragOverlay } from "@dnd-kit/core";
import Loading from "./components/pages/loading/LoadingPage";
import { columns } from "./constants/columns";
import KanbanColumn from "./components/kanban/KanbanColumn";
import { useDragOverTodos } from "./services/lib/todos/useDragOverTodos";
import TodoItem from "./components/todo/TodoItem";

function App() {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  //!Quary Todos//


  const { data: todos, isLoading, error } = useTodos();

  const activeTodo = todos?.find((t) => t.id === activeId) ?? null;

  //!Grouping and Sorting Todos
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

  // const { user, loading } = useAuth();

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
  useEffect(() => {
    document.addEventListener("mousedown", () => {
      console.log("GLOBAL");
    });

    return () => {
      document.removeEventListener("mousedown", () => {});
    };
  }, []);
  //!DRAG AND DROP
  const handleDragOver = useDragOverTodos(); //drag
  const handleDragEnd = useReorderTodos(); //drop

  //! HANDLERS

  if (isLoading) return <Loading />;

  if (error) return <p>{error.message}</p>;

  return (
    <TodoPage>
      <Layout>
        {/* //Form  */}
        <div className="mx-auto mb-8 max-w-2xl">
          {/* <TodoForm
            value={value}
            handleAddTodo={handleAddTodo}
            handleKeyDown={handleKeyDown}
            handleOnChange={handleOnChange}

            className="bg-card border-app mb-6 flex max-w-2xl items-center justify-center gap-3 rounded-2xl border px-5 py-4 shadow-lg"
          /> */}
        </div>
        {/* // drag and drop  */}
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
          collisionDetection={pointerWithin}
        >
          <div className="h-full overflow-x-auto">
            <div className="flex min-w-max gap-5 px-6 pb-6">
              <div className="flex h-full min-w-max gap-5">
                {columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    id={column.id}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    headerTitle={t(column.id)}
                    todos={groupedTodos[column.id]}
                  />
                ))}
              </div>
            </div>
          </div>
          {/* <DragOverlay /> */}

          <DragOverlay dropAnimation={null} adjustScale={false}>
            {activeTodo && (
              <TodoItem
                {...activeTodo}
                overlay
                menuOpen={false}
                openMenu={() => {}}
                closeMenu={() => {}}
              />
            )}
          </DragOverlay>
        </DndContext>
      </Layout>
    </TodoPage>
  );
}

export default App;
