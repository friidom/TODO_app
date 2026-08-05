import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

import ColumnMenu from "./ColumnMenu";
import LimitWarning from "./LimitWarning";
import { categoryOf } from "@/constants/columns";
import { limitBreach } from "@/services/columns/limitBreach";
import { useUpdateColumn } from "@/services/columns/useUpdateColumn";
import { cn } from "@/services/lib/utils";
import type { IColumn } from "@/types/data";

const PILL =
  "truncate rounded px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase";

export interface TransitionPill {
  title: string;
  category?: string;
}

interface Props {
  column: IColumn;
  headerTitle: string;
  count: number;
  isDragSource: boolean;
  transition: { from: TransitionPill; to: TransitionPill } | null;
  onCollapse: () => void;
  onSetLimit: () => void;
  onDelete: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canDelete: boolean;
  dragHandleProps?: Record<string, unknown>;
}

export default function ColumnHeader({
  column,
  headerTitle,
  count,
  isDragSource,
  transition,
  onCollapse,
  onSetLimit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  canDelete,
  dragHandleProps,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // While a card is in flight the header belongs to the transition state, so
  // the controls step aside.
  if (transition) {
    return (
      <Shell dragHandleProps={dragHandleProps}>
        <div
          key={transition.to.title}
          className="animate-in fade-in slide-in-from-top-1 flex min-w-0 items-center gap-2 duration-200"
        >
          <span className={cn(PILL, categoryOf(transition.from.category).pill)}>
            {transition.from.title}
          </span>

          <ArrowRight
            size={14}
            className="animate-in fade-in slide-in-from-left-1 shrink-0 text-gray-500 duration-300"
          />

          <span
            className={cn(
              PILL,
              "animate-in zoom-in-95 duration-300",
              categoryOf(transition.to.category).pill,
            )}
          >
            {transition.to.title}
          </span>
        </div>
      </Shell>
    );
  }

  if (isDragSource) {
    return (
      <Shell dragHandleProps={dragHandleProps}>
        <div className="animate-in fade-in w-full truncate rounded-md border-2 border-blue-500 bg-white py-1 text-center text-sm text-gray-700 duration-200">
          Transition to...
        </div>
      </Shell>
    );
  }

  if (renaming) {
    return (
      <Shell>
        <RenameField
          column={column}
          headerTitle={headerTitle}
          onDone={() => setRenaming(false)}
        />
      </Shell>
    );
  }

  const breach = limitBreach(column, count);

  return (
    <Shell dragHandleProps={dragHandleProps}>
      <button
        type="button"
        onClick={() => setRenaming(true)}
        title="Rename column"
        className="flex min-w-0 items-center gap-2 rounded px-2 py-1 text-left hover:bg-[#dcdfe4]"
      >
        <h2 className="truncate text-[15px] font-semibold text-[#172b4d]">
          {headerTitle}
        </h2>

        <span className="shrink-0 rounded bg-[#dcdfe4] px-1.5 py-0.5 text-xs font-semibold text-[#44546f]">
          {count}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {breach && <LimitWarning message={breach} />}

        {/* Hidden rather than transparent, so they claim no width and the
            warning slides out to the edge in their place. The menu stays put
            while its popup is open, or moving onto the popup would pull the
            trigger out from under the cursor. */}
        <div
          className={cn(
            "items-center gap-1",
            menuOpen
              ? "flex"
              : "hidden group-focus-within/header:flex group-hover/header:flex",
          )}
        >
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse column"
            title="Collapse column"
            className="rounded p-1 text-[#44546f] hover:bg-[#dcdfe4]"
          >
            <CollapseIcon />
          </button>

          <ColumnMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onSetLimit={onSetLimit}
            onDelete={onDelete}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            canDelete={canDelete}
          />
        </div>
      </div>
    </Shell>
  );
}

/** The header row itself — the column's only drag handle. */
function Shell({
  children,
  dragHandleProps,
}: {
  children: React.ReactNode;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      {...dragHandleProps}
      className={cn(
        "group/header flex shrink-0 items-center justify-between gap-2 px-3 py-3",
        // Only the draggable variants opt out of selection — the rename input
        // needs its text selectable.
        dragHandleProps &&
          "cursor-grab touch-none select-none active:cursor-grabbing",
      )}
    >
      {children}
    </div>
  );
}

function RenameField({
  column,
  headerTitle,
  onDone,
}: {
  column: IColumn;
  headerTitle: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(headerTitle);

  const updateColumn = useUpdateColumn();

  function save() {
    const trimmed = value.trim();

    if (!trimmed || trimmed === headerTitle) return onDone();

    updateColumn.mutate(
      { id: column.id, title: trimmed },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="relative w-full">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }

          if (e.key === "Escape") onDone();
        }}
        className="w-full rounded-md border-2 border-blue-500 bg-white px-2 py-1 text-lg font-semibold text-gray-700 outline-none"
      />

      <div className="absolute top-full right-0 z-10 mt-1 flex gap-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
          aria-label="Save name"
          className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-700 shadow-sm hover:bg-gray-100"
        >
          <Check size={16} />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDone}
          aria-label="Cancel rename"
          className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-700 shadow-sm hover:bg-gray-100"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Two arrows meeting in the middle — lucide has no matching glyph. */
function CollapseIcon() {
  return (
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
      <path d="M3 12h7M7 8l3 4-3 4" />
      <path d="M21 12h-7M17 8l-3 4 3 4" />
    </svg>
  );
}
