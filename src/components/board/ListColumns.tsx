import { FloatingPortal } from "@floating-ui/react";
import {
  CheckIcon,
  Columns3Icon,
  GripVerticalIcon,
  LockIcon,
  RotateCcwIcon,
} from "lucide-react";

import DropLine, { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import IconButton from "@/components/ui/IconButton";
import { LIST_COLUMN_GROUP } from "@/components/views/listReorder";
import { useBoardId } from "@/hooks/useBoardId";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import {
  LIST_COLUMNS,
  PINNED_COLUMN,
  isDefaultListColumns,
  isListColumnId,
  offeredListColumns,
  type ListColumnId,
} from "@/services/views/listColumns";
import { useListColumnWidths, useListColumns } from "@/stores/listColumns";
import { cn } from "@/utils/cn";

// A popover rather than DropdownMenu: a roving-tabindex menu would swallow the
// Space and arrow keys the grips use to lift and move a column.
export default function ListColumns() {
  const { open, mounted, triggerProps, panelProps } = useCardPopover();

  const sprintsEnabled = useSprintsEnabled();

  const columns = useListColumns((state) => state.columns);
  const boardId = useBoardId();
  const widths = useListColumnWidths(boardId);
  const toggle = useListColumns((state) => state.toggle);
  const move = useListColumns((state) => state.move);
  const reset = useListColumns((state) => state.reset);

  const offered = offeredListColumns({ sprintsEnabled });
  const shown = columns.filter((id) =>
    offered.some((column) => column.id === id),
  );
  const hidden = offered
    .map((column) => column.id)
    .filter((id) => !shown.includes(id));

  const customised =
    !isDefaultListColumns(shown) || Object.keys(widths).length > 0;

  return (
    <>
      <IconButton
        {...triggerProps}
        label={`Columns — ${shown.length} shown`}
        size="sm"
        active={customised}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Columns3Icon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Columns"
            className="border-hairline bg-elevated rounded-card shadow-e2 z-50 flex max-h-[70vh] w-64 flex-col border p-1"
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <p className="text-ink-3 text-mini flex-1 font-semibold tracking-wide uppercase">
                Columns
              </p>

              {customised && (
                <button
                  type="button"
                  onClick={() => boardId && reset(boardId)}
                  title="Default columns, order and widths"
                  className="text-ink-3 hover:text-ink text-mini flex items-center gap-1 rounded transition-colors"
                >
                  <RotateCcwIcon className="size-3" />
                  Reset
                </button>
              )}
            </div>

            <p className="text-ink-3/70 text-mini px-2 pb-1.5">
              Drag to reorder. Top to bottom here is left to right in the table.
            </p>

            <ReorderContext
              onReorder={({ activeId, overId, side }) => {
                if (
                  isListColumnId(activeId) &&
                  isListColumnId(overId) &&
                  side
                ) {
                  move(activeId, overId, side);
                }
              }}
              describe={(id) =>
                isListColumnId(id) ? LIST_COLUMNS[id].label : id
              }
              renderOverlay={(id) => (
                <DragChip>
                  <GripVerticalIcon className="text-ink-3 size-3.5" />
                  {isListColumnId(id) ? LIST_COLUMNS[id].label : id}
                </DragChip>
              )}
            >
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {shown.map((id) => (
                  <ColumnRow
                    key={id}
                    id={id}
                    visible
                    onToggle={() => toggle(id)}
                  />
                ))}

                {hidden.length > 0 && (
                  <li
                    aria-hidden
                    className="border-hairline mx-2 my-1 border-t"
                  />
                )}

                {hidden.map((id) => (
                  <ColumnRow
                    key={id}
                    id={id}
                    visible={false}
                    onToggle={() => toggle(id)}
                  />
                ))}
              </ul>
            </ReorderContext>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function ColumnRow({
  id,
  visible,
  onToggle,
}: {
  id: ListColumnId;
  visible: boolean;
  onToggle: () => void;
}) {
  const locked = id === PINNED_COLUMN;
  const label = LIST_COLUMNS[id].label;

  // A hidden column has no place in the table, so it has no place to drag to.
  const { setNodeRef, handleProps, isDragging, edge } = useReorderItem(id, {
    group: LIST_COLUMN_GROUP,
    axis: "y",
    disabled: locked || !visible,
  });

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "relative flex items-center gap-0.5",
        isDragging && "opacity-40",
      )}
    >
      <DropLine edge={edge} axis="y" className="inset-x-1" />

      {visible && !locked ? (
        <span
          {...handleProps}
          aria-label={`Reorder ${label}`}
          className="text-ink-3 hover:text-ink focus-visible:ring-brand grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded outline-none focus-visible:ring-2"
        >
          <GripVerticalIcon className="size-3.5" />
        </span>
      ) : (
        <span className="w-5 shrink-0" />
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={visible}
        aria-disabled={locked}
        onClick={locked ? undefined : onToggle}
        title={
          locked
            ? "The work item column always shows first — it names the row"
            : undefined
        }
        className={cn(
          "rounded-control focus-visible:bg-ink/10 flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none",
          locked ? "cursor-default" : "hover:bg-ink/10",
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {visible && <CheckIcon className="text-brand size-4" />}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            visible ? "text-ink" : "text-ink-3",
          )}
        >
          {label}
        </span>

        {locked && (
          <LockIcon
            aria-label="Locked"
            className="text-ink-3/60 size-3 shrink-0"
          />
        )}
      </button>
    </li>
  );
}
