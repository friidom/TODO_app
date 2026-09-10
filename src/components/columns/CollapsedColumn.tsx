import { useDraggable } from "@dnd-kit/core";

import LimitWarning from "./LimitWarning";
import { limitBreach } from "@/services/columns/limitBreach";
import { cn } from "@/utils/cn";
import type { IColumn } from "@/types/data";

interface Props {
  column: IColumn;
  headerTitle: string;
  count: number;
  onExpand: () => void;
}

// Same draggable id/type as the expanded column — only one of the two ever renders, so ids never collide.
export default function CollapsedColumn({
  column,
  headerTitle,
  count,
  onExpand,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  const breach = limitBreach(column, count);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/rail rounded-surface border-hairline bg-surface flex h-fit max-h-full w-11 shrink-0 flex-col items-center gap-3 border py-3",
        isDragging && "opacity-40",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex min-h-0 cursor-grab touch-none flex-col items-center gap-3 select-none active:cursor-grabbing"
      >
        <h2
          className="text-ink truncate text-sm font-semibold"
          style={{ writingMode: "vertical-rl" }}
        >
          {headerTitle}
        </h2>

        <span className="bg-ink/10 text-ink-2 shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold">
          {count}
        </span>
      </div>

      {breach && <LimitWarning message={breach} side="right" />}

      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand column"
        title="Expand column"
        className="text-ink-2 hover:bg-ink/10 hidden rounded p-1 group-focus-within/rail:block group-hover/rail:block"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
        </svg>
      </button>
    </div>
  );
}
