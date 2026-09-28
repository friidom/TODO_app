import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";
import {
  PINNED_COLUMN,
  type ListColumnDef,
} from "@/services/views/listColumns";
import { cn } from "@/utils/cn";
import { HEAD_CELL, STICKY_LEFT_HEAD, STICKY_RIGHT_HEAD } from "./listTable";

export default function ListHeader({
  columns,
  view,
}: {
  columns: ListColumnDef[];
  view: BoardView;
}) {
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <HeadCell key={column.id} column={column} view={view} />
        ))}

        <th scope="col" className={cn(HEAD_CELL, STICKY_RIGHT_HEAD, "px-1")}>
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}

function HeadCell({
  column,
  view,
}: {
  column: ListColumnDef;
  view: BoardView;
}) {
  const pinned = column.id === PINNED_COLUMN;

  const className = cn(
    HEAD_CELL,
    pinned && STICKY_LEFT_HEAD,
    column.align === "center" && "text-center",
  );

  // No SORT_KEYS entry means the pipeline cannot order by this field, so the
  // header offers nothing rather than an arrow that reorders nothing.
  if (column.sort === null) {
    return (
      <th scope="col" className={cn(className, "px-3")}>
        {column.label}
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
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
      className={cn(className, "p-0")}
    >
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
          "group/head hover:text-ink focus-visible:ring-brand flex h-9 w-full items-center gap-1 px-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
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
    </th>
  );
}
