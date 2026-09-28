import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import { cn } from "@/utils/cn";

interface Props {
  columnId: string;
  index: number;
  active: boolean;
  beforeId?: string;
  afterId?: string;
  // prop, not useDndContext() — that hook fires on every pointer move and bypasses memo, so ~200 gaps would re-render per drag
  dragging?: boolean;
  canAdd?: boolean;
  onAdd?: (index: number) => void;
}

// always in the DOM (so it can be measured on drag start), paints its line only when nearest the pointer
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
          <span className="bg-brand/40 pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100" />

          <IconButton
            label="Create work item"
            size="xs"
            tooltip={false}
            onClick={() => onAdd?.(index)}
            // pointer-events-none until hovered — this badge is taller than the gap and would otherwise steal hover from the cards
            className="border-hairline bg-elevated text-ink-2 hover:border-brand/40 hover:bg-elevated hover:text-brand active:bg-elevated shadow-e1 pointer-events-none absolute top-1/2 -left-2 z-10 -translate-y-1/2 border opacity-0 transition-[opacity,color,border-color] duration-100 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
          >
            <Plus />
          </IconButton>
        </>
      )}
    </div>
  );
});

export default DropZone;
