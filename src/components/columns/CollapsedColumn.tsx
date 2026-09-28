import { useDraggable } from "@dnd-kit/core";

import LimitWarning from "./LimitWarning";
import { COUNT_CHIP } from "./columnChrome";
import IconButton from "@/components/ui/IconButton";
import { categoryOf, type ColumnCategory } from "@/constants/columns";
import { limitBreach } from "@/services/columns/limitBreach";
import { cn } from "@/utils/cn";
import type { IColumn } from "@/types/data";

interface Props {
  column: IColumn;
  // Its first visible status's — a column has no category of its own.
  category: ColumnCategory;
  headerTitle: string;
  count: number;
  onExpand: () => void;
  // Column order is the workflow's, so only someone who may publish it can drag one.
  reorderDisabled?: boolean;
}

// Same draggable id/type as the expanded column — only one of the two ever renders, so ids never collide.
export default function CollapsedColumn({
  column,
  category,
  headerTitle,
  count,
  onExpand,
  reorderDisabled = false,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: column.id,
    data: { type: "column", columnId: column.id },
    disabled: reorderDisabled,
  });

  const breach = limitBreach(column, count);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/rail rounded-surface border-hairline bg-surface flex h-fit max-h-full w-11 shrink-0 flex-col items-center gap-2 border py-2.5",
        isDragging && "opacity-40",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${headerTitle} column`}
        aria-roledescription="column"
        className={cn(
          "focus-visible:ring-brand rounded-control flex min-h-0 touch-none flex-col items-center gap-2 px-1 py-1 outline-none select-none focus-visible:ring-2",
          !reorderDisabled && "cursor-grab active:cursor-grabbing",
        )}
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            categoryOf(category).dot,
          )}
        />

        <h2
          className="text-ink-2 text-mini truncate font-semibold tracking-wide uppercase"
          style={{ writingMode: "vertical-rl" }}
        >
          {headerTitle}
        </h2>

        <span className={COUNT_CHIP}>{count}</span>
      </div>

      {breach && <LimitWarning message={breach} side="right" />}

      <IconButton
        label="Expand column"
        tooltipSide="right"
        onClick={onExpand}
        className="coarse:pointer-events-auto coarse:opacity-100 pointer-events-none opacity-0 transition-[opacity,color,background-color] group-focus-within/rail:pointer-events-auto group-focus-within/rail:opacity-100 group-hover/rail:pointer-events-auto group-hover/rail:opacity-100"
      >
        <svg
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
      </IconButton>
    </div>
  );
}
