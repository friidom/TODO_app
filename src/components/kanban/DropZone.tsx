import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/services/lib/utils";

interface Props {
  columnId: string;
  index: number;
  active: boolean;
  /** Card directly above / below the gap — used to skip no-op drops. */
  beforeId?: number;
  afterId?: number;
}

/**
 * The empty space between two cards. It is always in the DOM (so it can be
 * measured on drag start) and only paints the line when the pointer is nearest
 * to it.
 */
export default function DropZone({
  columnId,
  index,
  active,
  beforeId,
  afterId,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: `todo-gap:${columnId}:${index}`,
    data: { type: "todo-gap", columnId, index, beforeId, afterId },
  });

  return (
    <div ref={setNodeRef} className="relative h-2.5 w-full shrink-0">
      <div
        className={cn(
          "absolute inset-x-0 top-1/2 h-[3px] overlay-indicator -translate-y-1/2 rounded-full bg-blue-500 transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
