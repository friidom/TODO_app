import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useTodos } from "./services/lib";
import TodoList from "./components/todo/TodoList";
import { useAddTodo } from "./services/lib/index";
import "./styles/global.css";
import Layout from "./components/layout/Layout";
import TodoForm from "./components/todo/TodoForm";

function App() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null!);

  const addTodoMutation = useAddTodo();

  // const addTodo = useTodoStore((state) => state.addTodo);

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

  //Quary Todos//

  const { data: todos, isLoading, error } = useTodos();

  if (isLoading) return <p>Loading...</p>;

  if (error) return <p>{error.message}</p>;

  return (
    <Layout>
      <TodoForm
        value={value}
        handleAddTodo={handleAddTodo}
        handleKeyDown={handleKeyDown}
        handleOnChange={handleOnChange}
        ref={inputRef}
        className="mb-4 bg-red-200 flex items-center gap-2 rounded-xl py-3 pl-3 pr-5 shadow-md md:py-4"
      />
        <TodoList todos={todos ?? []} />
    </Layout>
  );
}

export default App;
