import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useTodos } from "./services/lib";
import TodoList from "./components/todo/TodoList";
import { useAddTodo } from "./services/lib/index";
import "./styles/global.css";
import Layout from "./components/layout/Layout";
import TodoForm from "./components/todo/TodoForm";
import { useRegister } from "./services/lib/auth/useRegister";
import { supabase } from "./services/api/supabase";
import LoginForm from "./components/auth/LoginForm";
import { useAuth } from "./services/lib/auth/useAuth";
import TodoPage from "./components/pages/TodoPage";
import AuthPage from "./components/pages/AuthPage";
import { useLogout } from "./services/lib/auth/useLogout";
function App() {
  ///test
  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      console.log(user);
    }

    getUser();
  }, []);

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
  const { user, loading } = useAuth();
  console.log(todos);

  if (isLoading) return <p>Loading...</p>;

  if (error) return <p>{error.message}</p>;

  ///AUTH

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <TodoPage>
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

        <TodoList todos={todos ?? []} />
      </Layout>
    </TodoPage>
  );
}

export default App;
