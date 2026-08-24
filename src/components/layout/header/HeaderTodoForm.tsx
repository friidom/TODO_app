import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAddTodo } from "@/services/todos/useAddTodo";
import { useColumns } from "@/services/columns/useColumnsApi";
import { byRank } from "@/utils/rank";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * The board's quick-add: **a button that becomes a field** (M17).
 *
 * It used to be a permanently open 256px input sitting in the board header —
 * the widest thing on the page, and an always-open text box is a strange thing
 * to make the primary call to action. Now it is the toolbar's one filled
 * control, and the field it opens is the same field: same mutation, same
 * leftmost-column target, same permission gate, same Enter-to-submit.
 *
 * Collapsing on blur and on Escape is what lets it be a button most of the
 * time. It stays open after a submit so a run of cards can be typed without
 * reaching for the mouse — the behaviour the always-open input had, kept where
 * it actually matters.
 */
export default function HeaderTodoForm() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { canEditTodos } = usePermissions();

  const addTodoMutation = useAddTodo();
  const { data: columns = [] } = useColumns();

  // The board has no fixed set of columns, so a global quick-add needs a
  // defined destination: the leftmost one. Picked by rank rather than array
  // order, because the ["columns"] cache is patched optimistically and is not
  // guaranteed to stay sorted. Copy first — sorting the cached array in place
  // would mutate React Query's data.
  const targetColumn = [...columns].sort(byRank)[0];

  function handleAddTodo() {
    const title = value.trim();

    if (!title || !targetColumn) return;

    // No `index` — appends to the end of the column.
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

  // Creating work is editor and above (M3-05). This is the toolbar's most
  // prominent control, so leaving it there inert would be the loudest thing on
  // the page for someone who cannot use it.
  if (!canEditTodos) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!targetColumn}
        title={t("createTodo")}
        className="bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control text-meta flex h-9 shrink-0 items-center gap-1.5 px-3 font-medium shadow-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-50"
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
      // Closing on blur has to survive focus moving *within* the form — from
      // the input to the submit button — so it is checked on the form rather
      // than the input, and only when focus has left the subtree entirely.
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
