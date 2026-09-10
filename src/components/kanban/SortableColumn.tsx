import { useDraggable } from "@dnd-kit/core";
import type { ComponentProps } from "react";

import KanbanColumn from "./KanbanColumn";

type Props = Omit<ComponentProps<typeof KanbanColumn>, "dragHandleProps">;

export default function SortableColumn(props: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.column.id,
    data: { type: "column", columnId: props.column.id },
  });

  // no transform/transition — the column never leaves its slot, the DragOverlay is what moves
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`${props.headerTitle} column`}
      className={isDragging ? "opacity-40" : undefined}
    >
      <KanbanColumn
        {...props}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          "aria-label": `Reorder ${props.headerTitle} column`,
          "aria-roledescription": "column",
        }}
      />
    </div>
  );
}
