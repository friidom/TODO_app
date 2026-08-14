import { useDndContext, useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { cn } from "@/utils/cn";

interface Props {
  columnId: string;
  index: number;
  active: boolean;
  /** Card directly above / below the gap — used to skip no-op drops. */
  beforeId?: string;
  afterId?: string;
  /** Opens the inline create form at this gap. */
  onAdd?: () => void;
}

/**
 * The empty space between two cards. It is always in the DOM (so it can be
 * measured on drag start) and only paints the line when the pointer is nearest
 * to it.
 *
 * Idle, it doubles as a create affordance: hovering reveals a line and a `+`,
 * and clicking anywhere along it opens the form at that position.
 */
export default function DropZone({
  columnId,
  index,
  active,
  beforeId,
  afterId,
  onAdd,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: `todo-gap:${columnId}:${index}`,
    data: { type: "todo-gap", columnId, index, beforeId, afterId },
  });

  // While something is being dragged the gap means "drop here", so the create
  // affordance stays out of the way.
  const dragging = !!useDndContext().active;

  const showAdd = !!onAdd && !dragging;

  return (
    <div ref={setNodeRef} className="group relative h-2.5 w-full shrink-0">
      <div
        className={cn(
          "overlay-indicator absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-blue-500 transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />

      {showAdd && (
        <>
          {/* Decoration only — the badge is the sole click target. */}
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-blue-500 opacity-0 transition-opacity duration-100 group-hover:opacity-100" />

          <button
            type="button"
            onClick={onAdd}
            title="Create work item"
            aria-label="Create work item"
            // Inert until the gap is hovered, so the badge — which is taller
            // than the gap — never steals hover or drag area from the cards.
            className="border-hairline bg-elevated text-ink-2 pointer-events-none absolute top-1/2 -left-2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-md border opacity-0 shadow-sm transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100"
          >
            <Plus size={15} />
          </button>
        </>
      )}
    </div>
  );
}
