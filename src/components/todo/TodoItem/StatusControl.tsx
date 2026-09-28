import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { MENU_LABEL, POPOVER_PANEL } from "@/components/ui/controlChrome";
import { categoryOf, columnTitle } from "@/constants/columns";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useMoveTodo } from "@/services/todos/useMoveTodo";
import { useWorkflowGate } from "@/services/todos/useWorkflowGate";
import { byRank } from "@/utils/rank";
import { cn } from "@/utils/cn";
import { FIELD_CHIP, OPTION_ITEM } from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

// Status isn't a field — it's which column the card is in, so this just calls useMoveTodo, same as the menu and a drag.
export default function StatusControl({
  todoId,
  columnId,
  variant = "chip",
}: {
  todoId: string;
  columnId: string | null;
  // "field" is the task detail's primary control, "lozenge" the List's cell; the chip stays the dense default for cards and menus
  variant?: "chip" | "field" | "lozenge";
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { data: columns = [] } = useColumns();
  const moveTo = useMoveTodo(todoId);
  const workflow = useWorkflowGate();

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
        className={
          variant === "lozenge"
            ? cn(
                "text-ink focus-visible:ring-brand text-meta inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded border px-1.5 transition-colors outline-none focus-visible:ring-2",
                categoryOf(current?.category).lozenge,
              )
            : variant === "field"
              ? "border-hairline bg-surface text-ink hover:bg-wash-strong focus-visible:ring-brand rounded-control text-meta flex h-8 w-full min-w-0 items-center gap-2 border px-3 font-medium transition-colors outline-none focus-visible:ring-2"
              : cn(
                  FIELD_CHIP,
                  "bg-wash-strong text-ink-2 hover:bg-ink/15 hover:text-ink min-w-0 shrink gap-1.5",
                )
        }
      >
        {variant !== "lozenge" && (
          <span
            className={cn(
              "shrink-0 rounded-full",
              variant === "field" ? "size-2" : "size-1.5",
              categoryOf(current?.category).dot,
            )}
          />
        )}
        <span
          className={cn(
            "truncate",
            variant === "field" && "min-w-0 flex-1 text-left",
          )}
        >
          {label}
        </span>
        {variant === "field" && (
          <ChevronDownIcon className="text-ink-3 -mr-1 size-3.5 shrink-0" />
        )}
        {variant === "lozenge" && (
          <ChevronDownIcon className="size-3 shrink-0 opacity-70" />
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Status"
            className={cn(POPOVER_PANEL, "z-50 max-h-64 w-48 overflow-y-auto")}
          >
            <p className={MENU_LABEL}>Status</p>

            {ordered.map((column) => {
              const selected = column.id === columnId;
              // Offered only if the workflow would accept it. The API refuses it
              // too — this is so the option is not there to click in the first place.
              const refusal = selected
                ? null
                : workflow.refusal(current?.category, column.category);

              return (
                <button
                  key={column.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  disabled={refusal !== null}
                  title={refusal ?? undefined}
                  onClick={() => {
                    if (!selected) moveTo(column);
                    close();
                  }}
                  className={OPTION_ITEM}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      categoryOf(column.category).dot,
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {columnTitle(column.title)}
                  </span>
                  {selected && <CheckIcon className="text-brand size-4" />}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
