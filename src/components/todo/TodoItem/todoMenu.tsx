import { useDeleteTodo } from "@/services/lib";
import type { TodoMenuProps } from "@/types/data";

import {
  useFloating,
  FloatingPortal,
  offset,
  flip,
  shift,
  autoUpdate,
} from "@floating-ui/react";
import { MoreHorizontal } from "lucide-react";
import { useEffect } from "react";

export default function TodoMenu({
  menuOpen,
  openMenu,
  closeMenu,
  onEdit,
  todoId,
  currentStatus,
}: TodoMenuProps) {

    console.log("TodoMenu render", menuOpen);
    useEffect(() => {
  console.log("effect", menuOpen);

  if (!menuOpen) return;

  console.log("effect started");

  function handleClick() {
    console.log("document click");
    closeMenu();
  }

  document.addEventListener("mousedown", handleClick);

  return () => {
    console.log("cleanup");
    document.removeEventListener("mousedown", handleClick);
  };
}, [menuOpen]);


  const deleteTodoMutation = useDeleteTodo();

  const { refs, floatingStyles, context } = useFloating({
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });

  function handleEdit() {
    closeMenu();
    onEdit();
  }

  function handleDelete() {
    deleteTodoMutation.mutate(todoId);
    closeMenu();
  }
  useEffect(() => {
    if (!menuOpen) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;

      if (
        refs.reference.current &&
        refs.floating.current &&
        !refs.reference.current.contains(target) &&
        !refs.floating.current.contains(target)
      ) {
        closeMenu();
      }
    }

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen, closeMenu, refs]);
  useEffect(() => {
    if (!menuOpen) return;

    function handleClick(e: MouseEvent) {
      console.log("document click");

      const target = e.target as Node;

      if (
        refs.reference.current &&
        refs.floating.current &&
        !refs.reference.current.contains(target) &&
        !refs.floating.current.contains(target)
      ) {
        console.log("close");
        closeMenu();
      }
    }

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen]);
  console.log("TodoMenu render", menuOpen);
  return (
    <>
      {/* =========================
          TRIGGER
      ========================= */}

      <button
  ref={refs.setReference}
  onPointerDown={(e) => {
    e.stopPropagation();
    console.log("pointer");
  }}
  onClick={(e) => {
    e.stopPropagation();
    console.log("click");
    openMenu();
  }}
>
        <MoreHorizontal size={16} />
      </button>

      {/* =========================
          MENU
      ========================= */}

      {menuOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[9999] w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
          >
            {/* EDIT */}

            <button
              type="button"
              onClick={handleEdit}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Edit
            </button>

            {/* CHANGE STATUS */}

            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => {
                // Следующий этап:
                // открыть submenu со статусами
                console.log("Current status:", currentStatus);
              }}
            >
              <span>Change status</span>

              <span className="text-gray-400">›</span>
            </button>

            <div className="my-1 border-t border-gray-100" />

            {/* DELETE */}

            <button
              type="button"
              disabled={deleteTodoMutation.isPending}
              onClick={handleDelete}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteTodoMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
