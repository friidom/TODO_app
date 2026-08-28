import { useState } from "react";
import { ArrowRight, Check, Plus, X } from "lucide-react";

import ColumnMenu from "./ColumnMenu";
import LimitWarning from "./LimitWarning";
import { usePermissions } from "@/hooks/usePermissions";
import { categoryOf } from "@/constants/columns";
import { limitBreach } from "@/services/columns/limitBreach";
import { useUpdateColumn } from "@/services/columns/useUpdateColumn";
import { cn } from "@/utils/cn";
import type { IColumn } from "@/types/data";

const PILL =
  "truncate rounded px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase";

export interface TransitionPill {
  title: string;
  /** Nullable in the schema; `categoryOf()` falls back to `todo`. */
  category?: string | null;
}

interface Props {
  column: IColumn;
  headerTitle: string;
  count: number;
  isDragSource: boolean;
  transition: { from: TransitionPill; to: TransitionPill } | null;
  onCollapse: () => void;
  /** Opens the create form at the end of the column. Absent for a viewer. */
  onAdd?: () => void;
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
  onAdd,
  onSetLimit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  canDelete,
  dragHandleProps,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Every item behind the menu — limits, reorder, delete — is a column write,
  // so the trigger goes rather than each item being disabled one by one.
  const { canManageColumns } = usePermissions();

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
            className="animate-in fade-in slide-in-from-left-1 text-ink-2 shrink-0 duration-300"
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
        <div className="animate-in fade-in border-brand bg-elevated text-ink w-full truncate rounded-md border-2 py-1 text-center text-sm duration-200">
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
  const category = categoryOf(column.category);

  return (
    <Shell dragHandleProps={dragHandleProps}>
      {/* Renaming is a column write too. Left as a button either way so the
          header keeps its shape and spacing; it simply does not open the
          input for someone whose rename the database would refuse. */}
      <button
        type="button"
        onClick={() => canManageColumns && setRenaming(true)}
        title={canManageColumns ? "Rename column" : headerTitle}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left",
          canManageColumns && "hover:bg-ink/10",
        )}
      >
        {/* The category, as a dot rather than a pill (M17). The pill's filled
            block competed with the cards below it for the eye; a dot says the
            same thing — todo / in progress / done — and lets the title be the
            loudest thing in the header. The pill treatment survives where it
            still earns the weight: the transition state above. */}
        <span className={cn("size-2 shrink-0 rounded-full", category.dot)} />

        <h2 className="text-ink truncate text-xs font-semibold tracking-[0.06em] uppercase">
          {headerTitle}
        </h2>

        <span className="bg-ink/[0.08] text-ink-3 text-mini grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 font-semibold">
          {count}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {breach && <LimitWarning message={breach} />}

        {/* Transparent rather than hidden. These used to be `display: none`
            until hover, so the header's contents re-flowed under the cursor —
            the cluster appeared, claimed ~70px, and the title and count shifted
            left. Fading keeps the width reserved and nothing moves.
            `pointer-events` follows the opacity so an invisible button is not
            clickable, and the menu holds itself open, or moving onto its popup
            would pull the trigger out from under the cursor. */}
        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-150",
            menuOpen
              ? "opacity-100"
              : "coarse:pointer-events-auto coarse:opacity-100 pointer-events-none opacity-0 group-focus-within/header:pointer-events-auto group-focus-within/header:opacity-100 group-hover/header:pointer-events-auto group-hover/header:opacity-100",
          )}
        >
          {/* The same `openAt(todos.length)` the dashed button at the foot of
              the column calls — threaded up so the header carries the create
              affordance the reference puts there, without a second code path
              to the form. Editor and above; a viewer gets no `+` at either
              end. */}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Add a card to ${headerTitle}`}
              title="Add a card"
              className="text-ink-2 hover:bg-ink/10 hover:text-ink coarse:size-8 coarse:p-0 coarse:grid coarse:place-items-center rounded p-1 transition-colors"
            >
              <Plus size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse column"
            title="Collapse column"
            className="text-ink-2 hover:bg-ink/10 hover:text-ink coarse:size-8 coarse:p-0 coarse:grid coarse:place-items-center rounded p-1 transition-colors"
          >
            <CollapseIcon />
          </button>

          {canManageColumns && (
            <ColumnMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onSetLimit={onSetLimit}
              onDelete={onDelete}
              onMoveLeft={onMoveLeft}
              onMoveRight={onMoveRight}
              canDelete={canDelete}
            />
          )}
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
        // Transparent, and no bottom rule: the category wash is painted by the
        // column behind this row (M17), so anything opaque here would cut it
        // back into the coloured bar the gradient exists to avoid.
        "group/header relative flex h-12 shrink-0 items-center justify-between gap-2 px-3",
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
        // `text-sm`, near the 12px uppercase title it replaces. At `text-lg` the
        // field opened at 18px — half again the size of the heading, in a header
        // fixed at h-12 — so starting a rename visibly enlarged the column's
        // title and crowded the row it sits in.
        className="border-brand bg-elevated text-ink rounded-control w-full border-2 px-2 py-1 text-sm font-semibold outline-none"
      />

      <div className="absolute top-full right-0 z-10 mt-1 flex gap-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
          aria-label="Save name"
          className="border-hairline bg-elevated text-ink hover:bg-ink/10 rounded-md border p-1.5 shadow-e1"
        >
          <Check size={16} />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDone}
          aria-label="Cancel rename"
          className="border-hairline bg-elevated text-ink hover:bg-ink/10 rounded-md border p-1.5 shadow-e1"
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
