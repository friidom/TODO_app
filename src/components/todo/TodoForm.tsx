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
      className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-hairline bg-surface px-2"
    >
      <button
        type="submit"
        disabled={disabled}
        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink/10 text-ink-2 hover:bg-ink/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ink/10"
      >
        <Plus size={16} />
      </button>

      <input
        value={value}
        onChange={handleOnChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={t("createTodo")}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
      />
    </form>
  );
}
