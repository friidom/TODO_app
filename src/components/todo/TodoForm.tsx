import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  //! translate
  const { t } = useTranslation();

  return (
    <form className={className} onSubmit={handleAddTodo}>
      <button
        className="flex text-main size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-clr-completed"
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
        placeholder={t("createTodo")}
        className="
        w-full 
        bg-transparent 
        text-main 
        text-lg 
        outline-none
        placeholder:text-gray-400"
      />
    </form>
  );
}
