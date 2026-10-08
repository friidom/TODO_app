import { useDraggable } from "@dnd-kit/core";
import type { ComponentProps } from "react";

import KanbanColumn from "./KanbanColumn";
import { cn } from "@/utils/cn";

type Props = Omit<ComponentProps<typeof KanbanColumn>, "dragHandleProps"> & {
  // Column order is the workflow's, so only someone who may publish it can drag one.
  reorderDisabled?: boolean;
};

export default function SortableColumn({
  reorderDisabled = false,
  ...props
}: Props) {
  const { flexible } = props;

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
      // Flexible: basis-0 shares the row out equally whatever the cards hold, so a long title cannot widen its column. The
      // minimum sits below the fixed width so a laptop-width board fits instead of scrolling exactly as Fixed does.
      className={cn(
        isDragging && "opacity-40",
        flexible && "min-w-60 flex-1 basis-0",
      )}
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
