import { useDraggable } from "@dnd-kit/core";

import KanbanColumn from "./KanbanColumn";

export default function SortableColumn(props: any) {
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
