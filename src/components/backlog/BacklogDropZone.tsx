import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/utils/cn";

interface Props {
  sectionKey: string | null;
  index: number;
  active: boolean;
  beforeId?: string;
  afterId?: string;
}

// h-0, not the board's h-2.5 gap — the backlog is a flush table, so a real-height drop target would inject dead space into every row seam.
const BacklogDropZone = memo(function BacklogDropZone({
  sectionKey,
  index,
  active,
  beforeId,
  afterId,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: `backlog-gap:${sectionKey ?? "none"}:${index}`,
    data: { type: "backlog-gap", sectionKey, index, beforeId, afterId },
  });

  return (
    <div ref={setNodeRef} className="relative h-0 w-full">
      <div
        aria-hidden
        className={cn(
          "bg-brand pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] -translate-y-1/2 rounded-full transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
});

export default BacklogDropZone;
