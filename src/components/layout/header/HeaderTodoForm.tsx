import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAddTodo } from "@/services/todos/useAddTodo";
import { useColumns } from "@/services/columns/useColumnsApi";
import { byRank } from "@/utils/rank";
import { usePermissions } from "@/hooks/usePermissions";

export default function HeaderTodoForm() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { canEditTodos } = usePermissions();

  const addTodoMutation = useAddTodo();
  const { data: columns = [] } = useColumns();

  // sorted by rank, not array order — the cache isn't guaranteed to stay sorted; copy first so this doesn't mutate it
  const targetColumn = [...columns].sort(byRank)[0];

  function handleAddTodo() {
    const title = value.trim();

    if (!title || !targetColumn) return;

    addTodoMutation.mutate({
      title,
      column_id: targetColumn.id,
    });

    setValue("");
    inputRef.current?.focus();
  }

  function close() {
    setValue("");
    setOpen(false);
  }

  if (!canEditTodos) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!targetColumn}
        title={t("createTodo")}
        className="bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 focus-visible:ring-brand rounded-control text-meta flex h-9 shrink-0 items-center gap-1.5 px-3 font-medium shadow-e1 transition-colors outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-50"
      >
        <PlusIcon className="size-4" />
        <span className="hidden sm:inline">New task</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleAddTodo();
      }}
      // checked on the form, not the input — focus can move to the submit button without leaving the form
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      className="border-brand/40 bg-surface focus-within:ring-brand/40 rounded-control flex h-9 w-56 shrink-0 items-center gap-1.5 border px-1.5 focus-within:ring-2"
    >
      <button
        type="submit"
        disabled={!targetColumn}
        aria-label={t("createTodo")}
        className="bg-brand text-brand-fg hover:bg-brand/90 grid size-5 shrink-0 place-items-center rounded-[5px] transition-colors disabled:opacity-50"
      >
        <PlusIcon className="size-3.5" />
      </button>

      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder={t("createTodo")}
        className="text-ink placeholder:text-ink-3 text-meta min-w-0 flex-1 bg-transparent outline-none"
      />
    </form>
  );
}
