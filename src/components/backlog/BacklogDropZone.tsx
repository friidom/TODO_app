import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/utils/cn";

interface Props {
  sectionKey: string | null;
  index: number;
  active: boolean;
  /** Row directly above / below the gap — used to skip no-op drops. */
  beforeId?: string;
  afterId?: string;
}

/**
 * The boundary between two Backlog rows (M31-C) — the same always-mounted,
 * line-only drop target `DropZone.tsx` gives the Kanban Board, without its
 * create-affordance: the Backlog page's own "+ Create item" row already
 * exists elsewhere, so a gap here only ever means "drop here."
 *
 * **Zero-height, unlike the Board's own `h-2.5` gap, and that is deliberate
 * rather than a shortcut.** A Kanban column is a stack of detached cards, so
 * the gaps between them *are* the spacing and giving them 10px costs
 * nothing. The Backlog is a table — rows are flush and separated by
 * `border-b` — so an `h-2.5` target between every pair injected 10px of dead
 * space into each seam, which is the "strange spacing" it produced, and
 * moved every row down by a hidden amount that had nothing to do with the
 * data. Collapsing the target to `h-0` and painting the indicator as an
 * absolutely-positioned overlay centred on the seam (`top-0
 * -translate-y-1/2`) means it occupies no layout at all: the table looks
 * like a table, nothing shifts when a drag starts or ends, and the line
 * still lands exactly on the boundary the drop will use.
 *
 * The element is still measurable — `getBoundingClientRect` on a
 * zero-height block returns a real rect with a real `top`, which is all
 * `useBacklogDnd`'s nearest-gap comparison reads (`rect.top +
 * rect.height / 2`, here simply the seam itself).
 */
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
          // `rounded-full` on a 3px bar is the subtle rounded cap; `z-10`
          // keeps it above the neighbouring rows' own borders rather than
          // half-hidden behind them.
          "bg-brand pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] -translate-y-1/2 rounded-full transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
});

export default BacklogDropZone;
