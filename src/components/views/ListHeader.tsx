import type { ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
} from "lucide-react";

import ListColumns from "@/components/board/ListColumns";
import type { BoardView } from "@/hooks/useBoardView";
import {
  PINNED_COLUMN,
  SELECT_COLUMN_WIDTH,
  type ListColumnDef,
} from "@/services/views/listColumns";
import { cn } from "@/utils/cn";
import ListCheckbox from "./ListCheckbox";
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

  const className = cn(
    HEAD_CELL,
    pinned && STICKY_LEFT_HEAD,
    column.align === "center" && "text-center",
  );

  const style = pinned ? { left: SELECT_COLUMN_WIDTH } : undefined;

  // No SORT_KEYS entry means the pipeline cannot order by this field, so the
  // header offers nothing rather than an arrow that reorders nothing.
  if (column.sort === null) {
    return (
      <th scope="col" style={style} className={className}>
        <span className="flex items-center gap-1">
          {expand}
          <span className="truncate">{column.label}</span>
        </span>
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
      </span>
    </th>
  );
}
