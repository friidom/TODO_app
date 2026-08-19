import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { cn } from "@/utils/cn";

interface Props {
  columnId: string;
  index: number;
  active: boolean;
  /** Card directly above / below the gap — used to skip no-op drops. */
  beforeId?: string;
  afterId?: string;
  /**
   * Something on the board is being dragged.
   *
   * **A prop rather than `useDndContext()`, and that is the M9-05 fix.** This
   * component is mounted once per gap — about 200 times on a full board — and
   * reading the drag context here subscribed every one of them to a value
   * dnd-kit rewrites on every pointer move (`over`, `collisions`, the
   * transform). Context updates bypass `memo`, so no amount of memoising the
   * cards could stop it: the gaps re-rendered 200-at-a-time for the whole drag.
   * The board already knows this boolean; passing it down costs one prop and
   * lets the memo below actually hold.
   */
  dragging?: boolean;
  /** Whether this gap may open the create form at all. */
  canAdd?: boolean;
  /** Opens the inline create form at this gap. Stable — takes the index. */
  onAdd?: (index: number) => void;
}

/**
 * The empty space between two cards. It is always in the DOM (so it can be
 * measured on drag start) and only paints the line when the pointer is nearest
 * to it.
 *
 * Idle, it doubles as a create affordance: hovering reveals a line and a `+`,
 * and clicking anywhere along it opens the form at that position.
 */
const DropZone = memo(function DropZone({
  columnId,
  index,
  active,
  beforeId,
  afterId,
  dragging = false,
  canAdd = false,
  onAdd,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: `todo-gap:${columnId}:${index}`,
    data: { type: "todo-gap", columnId, index, beforeId, afterId },
  });

  // While something is being dragged the gap means "drop here", so the create
  // affordance stays out of the way.
  const showAdd = canAdd && !!onAdd && !dragging;

  return (
    <div ref={setNodeRef} className="group relative h-2.5 w-full shrink-0">
      <div
        className={cn(
          "overlay-indicator bg-brand absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />

      {showAdd && (
        <>
          {/* Decoration only — the badge is the sole click target. Held at 40%
              so the two purple lines this gap can draw are told apart: full
              strength means "the card lands here", faint means "you could make
              one here". */}
          <span className="bg-brand/40 pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-100 group-hover:opacity-100" />

          <button
            type="button"
            onClick={() => onAdd?.(index)}
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
});

export default DropZone;
