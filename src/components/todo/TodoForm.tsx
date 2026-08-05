import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TodoFormProps {
  value: string;
  handleOnChange: React.ChangeEventHandler<HTMLInputElement>;
  handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  handleAddTodo: () => void;
  disabled?: boolean;
}

export default function TodoForm({
  value,
  handleOnChange,
  handleKeyDown,
  handleAddTodo,
  disabled = false,
}: TodoFormProps) {
  const { t } = useTranslation();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleAddTodo();
      }}
      className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2"
    >
      <button
        type="submit"
        disabled={disabled}
        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-200"
      >
        <Plus size={16} />
      </button>

      <input
        value={value}
        onChange={handleOnChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={t("createTodo")}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
      />
    </form>
  );
}
