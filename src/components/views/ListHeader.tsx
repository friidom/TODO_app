import { useTranslation } from "react-i18next";
import { useCallback, useRef, type ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  EyeOffIcon,
  LockIcon,
  RotateCcwIcon,
} from "lucide-react";

import ListColumns from "@/components/board/ListColumns";
import DropLine from "@/components/dnd/DropLine";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import ResizeHandle from "@/components/ui/ResizeHandle";
import type { BoardView } from "@/hooks/useBoardView";
import { useBoardId } from "@/hooks/useBoardId";
import {
  LIST_COLUMNS,
  MAX_COLUMN_WIDTH,
  PINNED_COLUMN,
  SELECT_COLUMN_WIDTH,
  isElasticColumn,
  listColumnWidth,
  minListColumnWidth,
  tableMinWidth,
  type ListColumnDef,
  type ListColumnId,
  type ListColumnWidths,
} from "@/services/views/listColumns";
import { useListColumnWidths, useListColumns } from "@/stores/listColumns";
import { cn } from "@/utils/cn";
import { fitWidth, naturalWidths, sample } from "@/utils/fitColumn";
import ListCheckbox from "./ListCheckbox";
import TableColumnMenu from "./TableColumnMenu";
import { LIST_COLUMN_GROUP } from "./listReorder";
import {
  HEAD_CELL,
  STICKY_LEFT,
  STICKY_LEFT_HEAD,
  STICKY_RIGHT_HEAD,
} from "./listTable";

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
  const { t } = useTranslation();

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
            label={t("list.selectAll")}
            onChange={onSelectAll}
          />
        </th>

        {columns.map((column) => (
          <HeadCell
            key={column.id}
            column={column}
            columns={columns}
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
                          ? t("list.collapseAll")
                          : t("list.expandAll")
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

        <th aria-hidden className={cn(HEAD_CELL, "border-r-0 p-0")} />

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
  columns,
  view,
  expand,
}: {
  column: ListColumnDef;
  columns: ListColumnDef[];
  view: BoardView;
  expand: ReactNode;
}) {
  const { t } = useTranslation();
  const pinned = column.id === PINNED_COLUMN;
  const boardId = useBoardId();
  const widths = useListColumnWidths(boardId);
  const setWidths = useListColumns((state) => state.setWidths);
  const toggle = useListColumns((state) => state.toggle);
  const cell = useRef<HTMLTableCellElement | null>(null);

  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(
    column.id,
    { group: LIST_COLUMN_GROUP, axis: "x", disabled: pinned },
  );

  const ref = useCallback(
    (element: HTMLTableCellElement | null) => {
      cell.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );

  const sortBy = column.sort;
  const menu = (
    <TableColumnMenu
      name={column.label}
      groups={[
        sortBy === null
          ? []
          : [
              {
                label: t("list.sortAscending"),
                icon: ArrowUpIcon,
                run: () => view.setSortBy(sortBy, "asc"),
              },
              {
                label: t("list.sortDescending"),
                icon: ArrowDownIcon,
                run: () => view.setSortBy(sortBy, "desc"),
              },
            ],
        [
          {
            label: t("list.fitContent"),
            icon: ArrowLeftRightIcon,
            run: () => {
              const table = cell.current?.closest("table");
              const patch = table && fittedWidths(table, column, widths);

              if (boardId && patch) setWidths(boardId, patch);
            },
          },
          {
            label: t("list.resetWidth"),
            icon: RotateCcwIcon,
            run: () => boardId && setWidths(boardId, { [column.id]: null }),
          },
        ],
        pinned
          ? []
          : [
              {
                label: t("list.hideColumn"),
                icon: EyeOffIcon,
                run: () => toggle(column.id),
              },
            ],
      ]}
    />
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
      <ColumnResizer column={column} columns={columns} />
    </>
  );

  const lock = pinned && (
    <LockIcon
      aria-label={t("list.lockedColumn")}
      className="text-ink-3 mr-2 size-3 shrink-0 opacity-0 transition-opacity group-hover/th:opacity-60"
    />
  );

  // No SORT_KEYS entry means the pipeline cannot order by this field, so the
  // header offers nothing rather than an arrow that reorders nothing.
  if (column.sort === null) {
    return (
      <th
        ref={ref}
        {...pointerProps}
        scope="col"
        data-column={column.id}
        style={style}
        className={cn(className, "pr-1")}
      >
        <span className="flex items-center gap-1">
          {expand}
          <span className="min-w-0 flex-1 truncate">{column.label}</span>
          {lock}
          {menu}
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
      ref={ref}
      {...pointerProps}
      scope="col"
      data-column={column.id}
      style={style}
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
      className={cn(className, expand ? "py-0 pr-1" : "py-0 pr-1 pl-0")}
    >
      <span className="flex items-center gap-1">
        {expand}

        <button
          type="button"
          onClick={cycle}
          title={
            active
              ? descending
                ? t("list.sortedDesc", { name: column.label })
                : t("list.sortedAsc", { name: column.label })
              : t("list.sortBy", { name: column.label })
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
        {menu}
      </span>
      {chrome}
    </th>
  );
}

interface ResizeGesture {
  table: HTMLTableElement;
  col: HTMLElement | null;
  pinned: HTMLElement | null;
  filler: HTMLElement | null;
  // The pinned column's rendered width when it was still taking the slack: the
  // first resize turns it into an ordinary column at that width, so a column
  // grows to the right instead of eating into the one beside it.
  frozen: number | null;
  minWidth: string;
}

// The widths a fit stores: the column's own, and the pinned column's rendered
// width while it still takes the slack, for the reason ResizeGesture.frozen gives.
function fittedWidths(
  table: HTMLTableElement,
  column: ListColumnDef,
  widths: ListColumnWidths,
): Partial<Record<ListColumnId, number>> | null {
  const header = table.querySelector<HTMLElement>(
    `th[data-column="${column.id}"]`,
  );

  if (!header) return null;

  const cells = sample([
    ...table.querySelectorAll<HTMLElement>(`td[data-column="${column.id}"]`),
  ]);
  const [head, ...body] = naturalWidths(
    [header, ...cells],
    table.parentElement ?? table,
  );
  const frozen =
    column.id !== PINNED_COLUMN &&
    isElasticColumn(LIST_COLUMNS[PINNED_COLUMN], widths)
      ? table
          .querySelector(`th[data-column="${PINNED_COLUMN}"]`)
          ?.getBoundingClientRect().width
      : undefined;

  return {
    ...(frozen === undefined ? {} : { [PINNED_COLUMN]: frozen }),
    [column.id]: fitWidth(
      head,
      body,
      minListColumnWidth(column.id),
      MAX_COLUMN_WIDTH,
    ),
  };
}

// While dragging, widths go straight onto the <col>s and the table's min-width
// once a frame, and reach the store only on release: a store write per pointer
// move re-rendered the header and ran every row's memo check.
function ColumnResizer({
  column,
  columns,
  grip = false,
}: {
  column: ListColumnDef;
  columns: ListColumnDef[];
  grip?: boolean;
}) {
  const { t } = useTranslation();
  const boardId = useBoardId();
  const widths = useListColumnWidths(boardId);
  const setWidths = useListColumns((state) => state.setWidths);
  const gesture = useRef<ResizeGesture | null>(null);

  function begin(handle: HTMLElement): number {
    const start =
      handle.parentElement?.getBoundingClientRect().width ??
      listColumnWidth(column, widths);
    const table = handle.closest("table");

    if (!table) return start;

    const colOf = (id: string) =>
      table.querySelector<HTMLElement>(`col[data-column="${id}"]`);
    const pinned = colOf(PINNED_COLUMN);
    const filler = table.querySelector<HTMLElement>("col[data-filler]");

    const frozen = isElasticColumn(LIST_COLUMNS[PINNED_COLUMN], widths)
      ? column.id === PINNED_COLUMN
        ? start
        : (table
            .querySelector(`th[data-column="${PINNED_COLUMN}"]`)
            ?.getBoundingClientRect().width ?? null)
      : null;

    gesture.current = {
      table,
      col: colOf(column.id),
      pinned,
      filler,
      frozen,
      minWidth: table.style.minWidth,
    };

    if (frozen !== null) {
      if (pinned) pinned.style.width = `${frozen}px`;
      if (filler) filler.style.width = "";
    }

    return start;
  }

  function preview(width: number) {
    const current = gesture.current;

    if (!current) return;

    if (current.col) current.col.style.width = `${width}px`;

    current.table.style.minWidth = `${tableMinWidth(columns, {
      ...widths,
      ...(current.frozen === null ? {} : { [PINNED_COLUMN]: current.frozen }),
      [column.id]: width,
    })}px`;
  }

  function commit(width: number) {
    const frozen = gesture.current?.frozen ?? null;

    gesture.current = null;

    if (!boardId) return;

    setWidths(boardId, {
      ...(frozen === null ? {} : { [PINNED_COLUMN]: frozen }),
      [column.id]: width,
    });
  }

  function cancel() {
    const current = gesture.current;

    gesture.current = null;

    if (!current) return;

    if (current.col) {
      current.col.style.width = isElasticColumn(column, widths)
        ? ""
        : `${listColumnWidth(column, widths)}px`;
    }

    if (current.frozen !== null) {
      if (current.pinned) current.pinned.style.width = "";
      if (current.filler) current.filler.style.width = "0px";
    }

    current.table.style.minWidth = current.minWidth;
  }

  return (
    <ResizeHandle
      label={t("list.resize", { name: column.label })}
      hint={t("list.resizeHint")}
      value={listColumnWidth(column, widths)}
      min={minListColumnWidth(column.id)}
      max={MAX_COLUMN_WIDTH}
      begin={begin}
      preview={preview}
      commit={commit}
      cancel={cancel}
      fit={(handle) => {
        const table = handle.closest("table");
        const patch = table && fittedWidths(table, column, widths);

        if (boardId && patch) setWidths(boardId, patch);
      }}
      grip={grip}
      partner={(handle) =>
        handle
          .closest("table")
          ?.querySelector<HTMLElement>(
            `th[data-column="${column.id}"] [role=separator]`,
          )
      }
    />
  );
}

// A row of no height under the body, so each column's edge can be dragged from
// anywhere down the table. Only the pinned cell is sticky: a grip on the header
// would paint over the pinned column once its column scrolls beneath it.
export function ListColumnGrips({ columns }: { columns: ListColumnDef[] }) {
  return (
    <tfoot aria-hidden>
      <tr>
        <td className="h-0 p-0" />

        {columns.map((column) => {
          const pinned = column.id === PINNED_COLUMN;

          return (
            <td
              key={column.id}
              style={pinned ? { left: SELECT_COLUMN_WIDTH } : undefined}
              className={cn("h-0 p-0", pinned ? STICKY_LEFT : "relative")}
            >
              <ColumnResizer column={column} columns={columns} grip />
            </td>
          );
        })}

        <td className="h-0 p-0" />
        <td className="h-0 p-0" />
      </tr>
    </tfoot>
  );
}
