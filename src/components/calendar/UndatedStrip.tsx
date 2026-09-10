import { useDroppable } from "@dnd-kit/core";
import { CalendarOffIcon, PanelRightCloseIcon } from "lucide-react";

import type { BoardMember } from "@/services/members/membersApi";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import CalendarChip from "./CalendarChip";

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
  // registered even while collapsed — dnd-kit measures drop targets at drag start, so one that appears mid-drag never gets picked up
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

        <span className="text-ink-2 text-mini font-medium tabular-nums">
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

        <h3 className="text-ink min-w-0 flex-1 truncate text-xs font-semibold">
          No due date
        </h3>

        <span className="text-ink-3 text-mini shrink-0 tabular-nums">
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
          <p className="text-ink-3 text-mini px-2 py-8 text-center">
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
