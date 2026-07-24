import { Plus } from "lucide-react";
import { cn } from "../../services/lib/utils";
interface ITodoForm {
  value: string;
  handleOnChange: React.ChangeEventHandler<HTMLInputElement>;
  handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  handleAddTodo: () => void;
  ref: React.RefObject<HTMLInputElement> | null;
  className: string;
}

export default function TodoForm({
  value,
  handleOnChange,
  handleKeyDown,
  handleAddTodo,
  ref,
  className,
}: ITodoForm) {
  return (
    <form className={className} onSubmit={handleAddTodo}>
      <button
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-clr-completed"
        type="submit"
        aria-label="Add Todo"
        role="button"
      >
        <Plus className="w-4/5 text-clr-completed" />
      </button>

      <input
        value={value}
        ref={ref}
        onChange={handleOnChange}
        onKeyDown={handleKeyDown}
        placeholder="Create a new todo..."
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background-red-200 px-3 py-2 text-lg border-0 bg-transparent"
        )}
      />
    </form>
  );
}

