import { useColumns } from "@/services/columns/useColumnsApi";
import { useUpdateTodoColumn } from "@/services/todos/useUpdateTodoColumn";
import { useDoneFlash } from "@/stores/doneFlash";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect } from "react";

interface TodoColumnMenuProps {
  open: boolean;
  anchor: HTMLElement | null;
  closeMenu: () => void;
  todoId: string;
  /** Left out of the list — moving a card to where it already is does nothing.
   *  Null when the card has no column, in which case every column is offered. */
  currentColumnId: string | null;

  menuRef: React.RefObject<HTMLDivElement | null>;
}

export default function TodoColumnMenu({
  open,
  anchor,
  closeMenu,
  todoId,
  currentColumnId,
  menuRef,
}: TodoColumnMenuProps) {
  const updateTodoColumn = useUpdateTodoColumn();
  const flashDone = useDoneFlash((state) => state.flash);

  const { data: columns = [] } = useColumns();

  const { refs, floatingStyles } = useFloating({
    open,
    placement: "right-start",

    middleware: [offset(4), flip(), shift()],

    whileElementsMounted: autoUpdate,
  });

  //set to another html elemnt
  useEffect(() => {
    refs.setPositionReference(anchor);
  }, [anchor, refs]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <div
        ref={(node) => {
          menuRef.current = node;
          refs.setFloating(node);
        }}
        style={floatingStyles}
        className="z-[1000] w-52 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      >
        {columns
          .filter((column) => column.id !== currentColumnId)
          .map((column) => (
            <button
              key={column.id}
              type="button"
              onClick={() => {
                updateTodoColumn.mutate({
                  id: todoId,
                  column_id: column.id,
                });

                // Same ring as a drag into a done column — this menu is the
                // board's other way to move a card.
                if (column.category === "done") flashDone(todoId);

                closeMenu();
              }}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
            >
              {column.title}
            </button>
          ))}
      </div>
    </FloatingPortal>
  );
}
