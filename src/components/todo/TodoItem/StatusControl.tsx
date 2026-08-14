import { CheckIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import { categoryOf, columnTitle } from "@/constants/columns";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useMoveTodo } from "@/services/todos/useMoveTodo";
import { byRank } from "@/utils/rank";
import { cn } from "@/utils/cn";

/**
 * The card's status.
 *
 * **Status is not a field.** It is which column the card is in, which is why
 * this writes nothing of its own: it calls `useMoveTodo`, the same path the
 * three-dot menu uses and the same mutation a drag ends in. Nothing here
 * duplicates the move, the ordering, or the done-flash.
 *
 * The options are the board's real columns, read from `useColumns` and sorted
 * by `position` so the menu reads in the order the board does. Nothing is
 * hard-coded — a board with columns called Backlog and Shipped offers exactly
 * those.
 *
 * Unlike the other card controls this one is not controlled by a parent, and
 * deliberately so: moving a card is meaningful only once the card exists, so
 * there is no create-form counterpart to share a value with. The create form
 * picks its column by being opened inside one.
 */
export default function StatusControl({
  todoId,
  columnId,
}: {
  todoId: string;
  columnId: string | null;
}) {
  const { open, close, triggerProps, panelProps } = useCardPopover();
  const { data: columns = [] } = useColumns();
  const moveTo = useMoveTodo(todoId);

  const ordered = columns.slice().sort(byRank);
  const current = ordered.find((column) => column.id === columnId) ?? null;
  const label = current ? columnTitle(current.title) : "No status";

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={`Status: ${label}`}
        aria-label={`Status: ${label}`}
        className="bg-ink/10 text-ink-2 hover:bg-ink/15 hover:text-ink flex min-w-0 shrink items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            categoryOf(current?.category).dot,
          )}
        />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Status"
            className="border-hairline bg-elevated z-50 max-h-64 w-48 overflow-y-auto rounded-card border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <p className="text-ink-3 px-2 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
              Status
            </p>

            {ordered.map((column) => {
              const selected = column.id === columnId;

              return (
                <button
                  key={column.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    // Moving a card to where it already is is a write that
                    // changes nothing; skip it rather than round-trip.
                    if (!selected) moveTo(column);
                    close();
                  }}
                  className="text-ink hover:bg-ink/10 focus-visible:bg-ink/10 flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-sm transition-colors outline-none"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      categoryOf(column.category).dot,
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {columnTitle(column.title)}
                  </span>
                  {selected && (
                    <CheckIcon className="text-brand size-4 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
