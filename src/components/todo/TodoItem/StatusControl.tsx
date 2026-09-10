import { CheckIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import { categoryOf, columnTitle } from "@/constants/columns";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useMoveTodo } from "@/services/todos/useMoveTodo";
import { byRank } from "@/utils/rank";
import { cn } from "@/utils/cn";

// Status isn't a field — it's which column the card is in, so this just calls useMoveTodo, same as the menu and a drag.
export default function StatusControl({
  todoId,
  columnId,
}: {
  todoId: string;
  columnId: string | null;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
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
        className="bg-ink/10 text-ink-2 hover:bg-ink/15 hover:text-ink text-mini flex min-w-0 shrink items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            categoryOf(current?.category).dot,
          )}
        />
        <span className="truncate">{label}</span>
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Status"
            className="border-hairline bg-elevated rounded-card z-50 max-h-64 w-48 overflow-y-auto border p-1 shadow-e2"
          >
            <p className="text-ink-3 text-mini px-2 py-1.5 font-semibold tracking-wide uppercase">
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
                    if (!selected) moveTo(column);
                    close();
                  }}
                  className="text-ink hover:bg-ink/10 focus-visible:bg-ink/10 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none"
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
