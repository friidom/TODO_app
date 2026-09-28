import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";

import { useAddTodo } from "@/services/todos/useAddTodo";

// The List's own create affordance, sitting in the footer bar rather than in the
// table: it is outside the horizontal scroller, so it stays put while the fields
// are scrolled, and it needs no column of its own to live in.
//
// It goes through useAddTodo like every other create surface, which is what
// stamps the active sprint onto the new card without this component knowing
// sprints exist.
export default function ListCreateRow({
  columnId,
  disabled,
}: {
  columnId: string | undefined;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTodo = useAddTodo();

  if (disabled) return null;

  function submit() {
    const trimmed = title.trim();

    if (!trimmed || !columnId) return;

    addTodo.mutate({ title: trimmed, column_id: columnId });

    // stays open and refocused — creating one item is nearly always creating
    // several, and reopening the form between each is the slow way
    setTitle("");
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!columnId}
        className="text-ink-2 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand flex h-8 items-center gap-1.5 rounded px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-50"
      >
        <PlusIcon className="size-4" />
        Create
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      // checked on the form, not the input — focus can move to the submit
      // button without having left the form
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;

        setTitle("");
        setOpen(false);
      }}
      className="border-brand/50 focus-within:ring-brand/30 flex h-8 w-72 max-w-full items-center gap-1.5 rounded border bg-(--list-row) px-1.5 focus-within:ring-2"
    >
      <button
        type="submit"
        disabled={!columnId || title.trim() === ""}
        aria-label="Create work item"
        className="bg-brand text-brand-fg hover:bg-brand/90 grid size-5 shrink-0 place-items-center rounded-[5px] transition-colors disabled:opacity-40"
      >
        <PlusIcon className="size-3.5" />
      </button>

      <input
        ref={inputRef}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;

          event.stopPropagation();
          setTitle("");
          setOpen(false);
        }}
        aria-label="New work item title"
        placeholder="What needs doing?"
        className="placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
    </form>
  );
}
