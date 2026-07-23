import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useTodos } from "./services/lib";
import TodoList from "./components/TodoList";
import { useAddTodo } from "./services/lib/todos/useAddTodo";
import "./App.css";

function App() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
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

  const handleAddTodo = () => {
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
    <>
      <input
        value={value}
        ref={inputRef}
        onChange={handleOnChange}
        onKeyDown={handleKeyDown}
      />
      <button onClick={handleAddTodo}>ADD Task</button>
      <TodoList todos={todos ?? []} />
    </>
  );
}

export default App;
