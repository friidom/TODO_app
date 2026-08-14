import { useState } from "react";
import TodoForm from "@/components/todo/TodoForm";
import { useAddTodo } from "@/services/todos/useAddTodo";
import { useColumns } from "@/services/columns/useColumnsApi";
import { byPosition } from "@/utils/position";
import { usePermissions } from "@/hooks/usePermissions";

export default function HeaderTodoForm() {
  const [value, setValue] = useState("");

  const { canEditTodos } = usePermissions();

  const addTodoMutation = useAddTodo();
  const { data: columns = [] } = useColumns();

  // The board has no fixed set of columns, so a global quick-add needs a
  // defined destination: the leftmost one. Picked by `position` rather than
  // array order, because the ["columns"] cache is patched optimistically and
  // is not guaranteed to stay sorted. Copy first — sorting the cached array
  // in place would mutate React Query's data.
  const targetColumn = [...columns].sort(byPosition)[0];

  function handleAddTodo() {
    const title = value.trim();

    if (!title || !targetColumn) return;

    // No `index` — appends to the end of the column.
    addTodoMutation.mutate({
      title,
      column_id: targetColumn.id,
    });

    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTodo();
    }
  }

  // Creating work is editor and above (M3-05). The quick-add is the widest
  // control in the board header, so leaving it there inert would be the most
  // prominent thing on the page for someone who cannot use it.
  if (!canEditTodos) return null;

  return (
    <TodoForm
      value={value}
      handleOnChange={(e) => setValue(e.target.value)}
      handleKeyDown={handleKeyDown}
      handleAddTodo={handleAddTodo}
      disabled={!targetColumn}
    />
  );
}
