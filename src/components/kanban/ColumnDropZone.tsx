import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/services/lib/utils";

interface Props {
  index: number;
  active: boolean;
  /** Column directly left / right of the gap — used to skip no-op drops. */
  beforeId?: string;
  afterId?: string;
}

/** The empty space between two columns — also the board's horizontal gutter. */
export default function ColumnDropZone({
  index,
  active,
  beforeId,
  afterId,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: `column-gap:${index}`,
    data: { type: "column-gap", index, beforeId, afterId },
  });

  return (
    <div ref={setNodeRef} className="relative min-h-32 w-5 shrink-0">
      <div
        className={cn(
          "absolute  inset-y-0 left-1/2 w-[3px] h-full  overlay-indicator-column -translate-x-1/2 rounded-full bg-blue-500 transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
