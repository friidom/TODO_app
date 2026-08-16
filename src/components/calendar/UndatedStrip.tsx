import { useDroppable } from "@dnd-kit/core";
import { CalendarOffIcon, PanelRightCloseIcon } from "lucide-react";

import type { BoardMember } from "@/services/members/membersApi";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import CalendarChip from "./CalendarChip";

/**
 * The work items with no due date (M19).
 *
 * **M19 makes this a decision and this is the answer: a side strip you can drag
 * from.** The milestone's own words are the reason — *"a calendar that silently
 * hides a third of the board is the same lie the filtered task count was fixed
 * to avoid"* — and on a real board undated work is not a third but most of it.
 * Dropping them off the calendar entirely was the other option on the table; it
 * loses the one gesture that makes a calendar useful for planning, which is
 * dragging something undated onto a day.
 *
 * **It is also a drop target, and that is what makes the gesture reversible.**
 * Dragging a card back here clears `due_date` through the same write that set
 * it. A one-way affordance would mean the only way to undo a mistaken drop is
 * to find the card, open it and clear the field.
 *
 * Collapsible, because a board with sixty undated items should not force a
 * permanent 16rem tax on the grid — and the header keeps reporting the count
 * while collapsed, so closing it is not the same as hiding it.
 */
export default function UndatedStrip({
  todos,
  keyPrefix,
  memberById,
  canEdit,
  collapsed,
  onToggle,
  onOpenTask,
}: {
  todos: Todo[];
  keyPrefix: string;
  memberById: Map<string, BoardMember>;
  canEdit: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpenTask: (id: string) => void;
}) {
  // Registered whether or not the strip is open: a droppable that unmounts
  // when collapsed would make the clear-date gesture depend on a panel being
  // open, and @dnd-kit measures on drag start, so a target that appears
  // mid-drag is not measured at all.
  const { setNodeRef, isOver } = useDroppable({
    id: "undated",
    data: { day: null },
  });

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "border-hairline rounded-surface flex shrink-0 flex-col items-center gap-2 border p-2 transition-colors",
          isOver ? "border-brand/50 bg-brand-soft" : "bg-surface",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          title={`No due date — ${todos.length}`}
          aria-label={`Show undated work items (${todos.length})`}
          className="text-ink-3 hover:text-ink hover:bg-ink/[0.06] focus-visible:ring-brand rounded-control grid size-7 place-items-center transition-colors outline-none focus-visible:ring-2"
        >
          <CalendarOffIcon className="size-4" />
        </button>

        <span className="text-ink-2 text-[11px] font-medium tabular-nums">
          {todos.length}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-hairline rounded-surface flex w-56 shrink-0 flex-col border transition-colors",
        isOver ? "border-brand/50 bg-brand-soft" : "bg-surface",
      )}
    >
      <header className="border-hairline flex items-center gap-2 border-b px-3 py-2">
        <CalendarOffIcon className="text-ink-3 size-3.5 shrink-0" />

        <h3 className="text-ink min-w-0 flex-1 truncate text-[12px] font-semibold">
          No due date
        </h3>

        <span className="text-ink-3 shrink-0 text-[11px] tabular-nums">
          {todos.length}
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide undated work items"
          className="text-ink-3 hover:text-ink hover:bg-ink/[0.06] focus-visible:ring-brand rounded-control grid size-5 shrink-0 place-items-center transition-colors outline-none focus-visible:ring-2"
        >
          <PanelRightCloseIcon className="size-3.5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        {todos.length === 0 ? (
          <p className="text-ink-3 px-2 py-8 text-center text-[11px]">
            {canEdit
              ? "Drag a work item here to clear its due date."
              : "Everything here has a due date."}
          </p>
        ) : (
          todos.map((todo) => (
            <CalendarChip
              key={todo.id}
              todo={todo}
              keyPrefix={keyPrefix}
              assignee={
                todo.assignee_id ? memberById.get(todo.assignee_id) : undefined
              }
              draggable={canEdit}
              onOpen={() => onOpenTask(todo.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
