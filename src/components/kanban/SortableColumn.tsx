import { useDraggable } from "@dnd-kit/core";
import type { ComponentProps } from "react";

import KanbanColumn from "./KanbanColumn";

// Everything but the handle, which this component owns.
type Props = Omit<ComponentProps<typeof KanbanColumn>, "dragHandleProps">;

export default function SortableColumn(props: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.column.id,
    data: { type: "column", columnId: props.column.id },
  });

  // No transform / no transition: the column never leaves its slot, the
  // DragOverlay is what moves.
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : undefined}>
      <KanbanColumn
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
