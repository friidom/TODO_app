import {
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  LockIcon,
} from "lucide-react";

import ListColumns from "@/components/board/ListColumns";
import DropLine from "@/components/dnd/DropLine";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import type { BoardView } from "@/hooks/useBoardView";
import {
  MAX_COLUMN_WIDTH,
  PINNED_COLUMN,
  SELECT_COLUMN_WIDTH,
  minListColumnWidth,
  type ListColumnDef,
} from "@/services/views/listColumns";
import { useListColumns } from "@/stores/listColumns";
import { cn } from "@/utils/cn";
import ListCheckbox from "./ListCheckbox";
import { LIST_COLUMN_GROUP } from "./listReorder";
import { HEAD_CELL, STICKY_LEFT_HEAD, STICKY_RIGHT_HEAD } from "./listTable";

export interface ListHeaderProps {
  columns: ListColumnDef[];
  view: BoardView;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (selected: boolean) => void;
  canExpand: boolean;
  allExpanded: boolean;
  onExpandAll: () => void;
}

export default function ListHeader({
  columns,
  view,
  allSelected,
  someSelected,
  onSelectAll,
  canExpand,
  allExpanded,
  onExpandAll,
}: ListHeaderProps) {
  return (
    <thead>
      <tr>
        <th
          scope="col"
          style={{ left: 0 }}
          className={cn(HEAD_CELL, STICKY_LEFT_HEAD, "p-0")}
        >
          <ListCheckbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            label="Select all work items"
            onChange={onSelectAll}
          />
        </th>

        {columns.map((column) => (
          <HeadCell
            key={column.id}
            column={column}
            view={view}
            expand={
              column.id === PINNED_COLUMN ? (
                <span className="grid size-6 shrink-0 place-items-center">
                  {canExpand && (
                    <button
                      type="button"
                      data-disclosure
                      onClick={onExpandAll}
                      aria-expanded={allExpanded}
                      aria-label={
                        allExpanded
                          ? "Collapse all subtasks"
                          : "Expand all subtasks"
                      }
                      className="text-ink-2 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand grid size-6 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-4 transition-transform duration-150",
                          allExpanded && "rotate-90",
                        )}
                      />
                    </button>
                  )}
                </span>
              ) : null
            }
          />
        ))}

        <th
          scope="col"
          className={cn(HEAD_CELL, STICKY_RIGHT_HEAD, "px-0 text-center")}
        >
          <ListColumns />
        </th>
      </tr>
    </thead>
  );
}

function HeadCell({
  column,
  view,
  expand,
}: {
  column: ListColumnDef;
  view: BoardView;
  expand: ReactNode;
}) {
  const pinned = column.id === PINNED_COLUMN;

  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(
    column.id,
    { group: LIST_COLUMN_GROUP, axis: "x", disabled: pinned },
  );

  const className = cn(
    HEAD_CELL,
    "group/th",
    pinned ? STICKY_LEFT_HEAD : "cursor-grab",
    column.align === "center" && "text-center",
    isDragging && "opacity-40",
  );

  const style = pinned ? { left: SELECT_COLUMN_WIDTH } : undefined;

  const chrome = (
    <>
      <DropLine edge={edge} axis="x" />
      <ResizeHandle column={column} />
    </>
  );

  const lock = pinned && (
    <LockIcon
      aria-label="Locked column"
      className="text-ink-3 mr-2 size-3 shrink-0 opacity-0 transition-opacity group-hover/th:opacity-60"
    />
  );

  // No SORT_KEYS entry means the pipeline cannot order by this field, so the
  // header offers nothing rather than an arrow that reorders nothing.
  if (column.sort === null) {
    return (
      <th
        ref={setNodeRef}
        {...pointerProps}
        scope="col"
        style={style}
        className={className}
      >
        <span className="flex items-center gap-1">
          {expand}
          <span className="min-w-0 flex-1 truncate">{column.label}</span>
          {lock}
        </span>
        {chrome}
      </th>
    );
  }

  const active = view.sort === column.sort;
  const descending = active && view.dir === "desc";
  const Icon = !active
    ? ChevronsUpDownIcon
    : descending
      ? ArrowDownIcon
      : ArrowUpIcon;

  // asc -> desc -> off, so a header can undo itself without a trip to the Sort
  // menu. "Off" is `manual`, which for the List is the board's own order.
  function cycle() {
    if (column.sort === null) return;

    if (!active) view.setSortBy(column.sort, "asc");
    else if (!descending) view.setSortBy(column.sort, "desc");
    else view.setSortBy("manual", "asc");
  }

  return (
    <th
      ref={setNodeRef}
      {...pointerProps}
      scope="col"
      style={style}
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
      className={cn(className, expand ? "py-0 pr-0" : "p-0")}
    >
      <span className="flex items-center gap-1">
        {expand}

        <button
          type="button"
          onClick={cycle}
          title={
            active
              ? descending
                ? `Sorted by ${column.label}, descending — click to clear`
                : `Sorted by ${column.label}, ascending — click for descending`
              : `Sort by ${column.label}`
          }
          className={cn(
            "group/head hover:text-ink focus-visible:ring-brand flex h-10 min-w-0 flex-1 items-center gap-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
            expand ? "pr-2" : "px-2",
            column.align === "center" && "justify-center",
            active && "text-brand",
          )}
        >
          <span className="truncate">{column.label}</span>

          <Icon
            className={cn(
              "size-3 shrink-0 transition-opacity",
              active
                ? "opacity-100"
                : "opacity-0 group-hover/head:opacity-60 group-focus-visible/head:opacity-60",
            )}
          />
        </button>
        {lock}
      </span>
      {chrome}
    </th>
  );
}

const KEY_STEP = 16;

// Drags the column's right edge. The width is previewed live and remembered on
// release; the elastic work column reads the result as its floor.
function ResizeHandle({ column }: { column: ListColumnDef }) {
  const stored = useListColumns((state) => state.widths[column.id]);
  const previewWidth = useListColumns((state) => state.previewWidth);
  const setWidth = useListColumns((state) => state.setWidth);
  const resetWidth = useListColumns((state) => state.resetWidth);

  const [resizing, setResizing] = useState(false);

  // Measured rather than read from the store: the elastic column's rendered
  // width is its share of the slack, not its stored floor.
  const measure = (handle: HTMLElement) =>
    handle.parentElement?.getBoundingClientRect().width ?? column.width;

  function onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;

    event.preventDefault();

    const handle = event.currentTarget;
    const start = measure(handle);
    const origin = event.clientX;
    let width = start;

    handle.setPointerCapture(event.pointerId);
    setResizing(true);

    const move = (moved: PointerEvent) => {
      width = start + moved.clientX - origin;
      previewWidth(column.id, width);
    };

    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setResizing(false);
      setWidth(column.id, width);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    const step =
      event.key === "ArrowRight"
        ? KEY_STEP
        : event.key === "ArrowLeft"
          ? -KEY_STEP
          : 0;

    if (!step) return;

    event.preventDefault();
    setWidth(column.id, measure(event.currentTarget) + step);
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${column.label}`}
      aria-valuenow={Math.round(stored ?? column.width)}
      aria-valuemin={minListColumnWidth(column.id)}
      aria-valuemax={MAX_COLUMN_WIDTH}
      tabIndex={0}
      data-no-drag
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => resetWidth(column.id)}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none outline-none",
        "after:absolute after:inset-y-2 after:right-0 after:w-0.5 after:rounded-full after:transition-colors",
        "hover:after:bg-brand focus-visible:after:bg-brand",
        resizing && "after:bg-brand",
      )}
    />
  );
}
