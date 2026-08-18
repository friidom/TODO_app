import { useDraggable } from "@dnd-kit/core";
import type { ComponentProps } from "react";

import KanbanColumn from "./KanbanColumn";

// Everything but the handle, which this component owns.
type Props = Omit<ComponentProps<typeof KanbanColumn>, "dragHandleProps">;

export default function SortableColumn(props: Props) {
  // Not disabled alongside the cards, deliberately. Columns render in
  // `columns.position` order whatever the view sort is doing to the cards
  // inside them, so a column drop still means exactly one thing — and taking a
  // working capability away because a neighbouring one is ambiguous would be
  // the wrong trade.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.column.id,
    data: { type: "column", columnId: props.column.id },
  });

  // No transform / no transition: the column never leaves its slot, the
  // DragOverlay is what moves.
  return (
    <div
      ref={setNodeRef}
      // M9-02. A column is a labelled region of the board rather than a
      // control, so it is a `group` — the drag handle inside it is the button,
      // and dnd-kit gives that its own role. Without the label a screen reader
      // announces "group" and leaves the listener to work out which one from
      // whatever it reads next.
      role="group"
      aria-label={`${props.headerTitle} column`}
      className={isDragging ? "opacity-40" : undefined}
    >
      <KanbanColumn
        {...props}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          // Names the handle rather than the region: the same text would be
          // read twice otherwise, once for the group and once for the button
          // inside it.
          "aria-label": `Reorder ${props.headerTitle} column`,
          "aria-roledescription": "column",
        }}
      />
    </div>
  );
}
