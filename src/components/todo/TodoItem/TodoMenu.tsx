import { useEffect, useRef, useState } from "react";
import {
  FloatingPortal,
  offset,
  flip,
  shift,
  autoUpdate,
  useFloating,
} from "@floating-ui/react";
import { MoreHorizontal } from "lucide-react";
import TodoStatusMenu from "./TodoColumnMenu";

import { useDeleteTodo } from "@/services/todos/useDeleteTodo";

interface TodoMenuProps {
  todoId: number;
  /** The card's column, so the move menu can leave it out. Nullable, as the column is. */
  columnId: string | null;
}

export default function TodoMenu({ todoId, columnId }: TodoMenuProps) {
  const [open, setOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const changeStatusButton = useRef<HTMLButtonElement>(null);

  //deletion
  const deleteTodoMutation = useDeleteTodo();

  const { refs, floatingStyles } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",

    middleware: [offset(6), flip(), shift()],

    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;

      const insideMainMenu = refs.floating.current?.contains(target) ?? false;

      const insideTrigger =
        (refs.reference.current as Node | null)?.contains(target) ?? false;

      const insideStatusMenu = statusMenuRef.current?.contains(target) ?? false;

      if (insideMainMenu || insideTrigger || insideStatusMenu) {
        return;
      }
      closeMenu();
    }

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, refs]);

  function closeMenu() {
    setOpen(false);
    setStatusMenuOpen(false);
  }

  return (
    <>
      <button
        ref={refs.setReference}
        onClick={() => {
          setOpen((v) => !v);
          setStatusMenuOpen(false);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          >
            <button
              type="button"
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
            >
              Edit
            </button>

            <button
              ref={changeStatusButton}
              type="button"
              onClick={() => setStatusMenuOpen((v) => !v)}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
            >
              Change status
            </button>

            <div className="my-1 h-px bg-gray-100" />

            <button
              type="button"
              onClick={() => deleteTodoMutation.mutate(todoId)}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none"
            >
              Delete
            </button>
          </div>
        </FloatingPortal>
      )}
      <TodoStatusMenu
        currentColumnId={columnId}
        open={statusMenuOpen}
        anchor={changeStatusButton.current}
        closeMenu={closeMenu}
        todoId={todoId}
        menuRef={statusMenuRef}
      />
    </>
  );
}
