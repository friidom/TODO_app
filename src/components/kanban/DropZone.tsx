import { useTranslation } from "react-i18next";
import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { cn } from "@/utils/cn";

interface Props {
  columnId: string;
  index: number;
  active: boolean;
  beforeId?: string;
  afterId?: string;
  // prop, not useDndContext() — that hook fires on every pointer move and bypasses memo, so ~200 gaps would re-render per drag
  dragging?: boolean;
  // a drag just ended with the pointer resting on a gap; hover must not reveal the create control until it moves
  settling?: boolean;
  canAdd?: boolean;
  onAdd?: (index: number) => void;
}

// always in the DOM (so it can be measured on drag start), paints its line only when nearest the pointer
const DropZone = memo(function DropZone({
  columnId,
  index,
  active,
  beforeId,
  afterId,
  dragging = false,
  settling = false,
  canAdd = false,
  onAdd,
}: Props) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({
    id: `todo-gap:${columnId}:${index}`,
    data: { type: "todo-gap", columnId, index, beforeId, afterId },
  });

  const showAdd = canAdd && !!onAdd && !dragging;

  return (
    <div ref={setNodeRef} className="group relative h-2.5 w-full shrink-0">
      <div
        className={cn(
          "overlay-indicator bg-brand absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />

      {showAdd && (
        <>
          <span
            className={cn(
              "bg-brand/40 pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-100 group-focus-within:opacity-100",
              !settling && "group-hover:opacity-100",
            )}
          />

          {/* hit box is the gap band only: the taller badge overhangs both cards and must not take their hover or clicks */}
          <button
            type="button"
            aria-label={t("list.createItem")}
            onClick={() => onAdd?.(index)}
            className={cn(
              "group/add coarse:w-8 pointer-events-none absolute inset-y-0 -left-2 z-10 w-6 outline-none",
              !settling && "group-hover:pointer-events-auto",
            )}
          >
            <span
              className={cn(
                "border-hairline bg-elevated text-ink-2 rounded-control shadow-e1 coarse:size-8 group-hover/add:border-brand/40 group-hover/add:text-brand group-focus-visible/add:ring-brand pointer-events-none absolute top-1/2 left-0 grid size-6 -translate-y-1/2 place-items-center border opacity-0 transition-[opacity,color,border-color] duration-100 group-focus-visible/add:opacity-100 group-focus-visible/add:ring-2",
                !settling && "group-hover:opacity-100",
              )}
            >
              <Plus className="size-3.5" />
            </span>
          </button>
        </>
      )}
    </div>
  );
});

export default DropZone;
