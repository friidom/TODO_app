import { useDraggable } from "@dnd-kit/core";
import type { ComponentProps } from "react";

import KanbanColumn from "./KanbanColumn";

type Props = Omit<ComponentProps<typeof KanbanColumn>, "dragHandleProps"> & {
  // Column order is the workflow's, so only someone who may publish it can drag one.
  reorderDisabled?: boolean;
};

export default function SortableColumn({
  reorderDisabled = false,
  ...props
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.column.id,
    data: { type: "column", columnId: props.column.id },
    disabled: reorderDisabled,
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
        dragHandleProps={
          reorderDisabled
            ? undefined
            : {
                ...attributes,
                ...listeners,
                "aria-label": `Reorder ${props.headerTitle} column`,
                "aria-roledescription": "column",
              }
        }
      />
    </div>
  );
}
