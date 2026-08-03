import { useState } from "react";
import { useTranslation } from "react-i18next";
import TodoForm from "@/components/todo/TodoForm";
import { useAddTodo } from "@/services/lib";

export default function HeaderTodoForm() {
  const { t } = useTranslation();

  const [value, setValue] = useState("");

  const addTodoMutation = useAddTodo();

  function handleAddTodo() {
    const title = value.trim();

    if (!title) return;

    addTodoMutation.mutate({
      title,
      status: "todo",
    });

    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTodo();
    }
  }

  return (
    <TodoForm
      value={value}
      handleOnChange={(e) => setValue(e.target.value)}
      handleKeyDown={handleKeyDown}
      handleAddTodo={handleAddTodo}
    />
  );
}
