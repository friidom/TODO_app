import { useState } from "react";
import { ArrowRight, Check, Plus, X } from "lucide-react";

import CategoryPill from "./CategoryPill";
import ColumnMenu from "./ColumnMenu";
import LimitWarning from "./LimitWarning";
import { COLUMN_TITLE, COUNT_CHIP } from "./columnChrome";
import IconButton from "@/components/ui/IconButton";
import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";
import { categoryOf } from "@/constants/columns";
import { limitBreach } from "@/services/columns/limitBreach";
import { useUpdateColumn } from "@/services/columns/useUpdateColumn";
import { cn } from "@/utils/cn";
import type { IColumn } from "@/types/data";

export interface TransitionPill {
  title: string;
  category?: string | null;
}

interface Props {
  column: IColumn;
  headerTitle: string;
  count: number;
  isDragSource: boolean;
  transition: { from: TransitionPill; to: TransitionPill } | null;
  onCollapse: () => void;
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

  const { canManageColumns } = usePermissions();

  if (transition) {
    return (
      <Shell dragHandleProps={dragHandleProps}>
        <div
          key={transition.to.title}
          className="animate-in fade-in slide-in-from-top-1 flex min-w-0 items-center gap-1.5 duration-200"
        >
          <CategoryPill
            title={transition.from.title}
            category={transition.from.category}
            className="text-ink-2"
          />

          <ArrowRight className="animate-in fade-in slide-in-from-left-1 text-ink-3 size-3.5 shrink-0 duration-300" />

          <CategoryPill
            title={transition.to.title}
            category={transition.to.category}
            className="animate-in zoom-in-95 duration-300"
          />
        </div>
      </Shell>
    );
  }

  if (isDragSource) {
    return (
      <Shell dragHandleProps={dragHandleProps}>
        <div className="animate-in fade-in border-brand/50 bg-brand-soft text-brand rounded-control text-meta w-full truncate border border-dashed py-1 text-center font-medium duration-200">
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

  const label = (
    <>
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          categoryOf(column.category).dot,
        )}
      />

      <h2 className={COLUMN_TITLE}>{headerTitle}</h2>

      <span className={COUNT_CHIP}>{count}</span>
    </>
  );

  return (
    <Shell dragHandleProps={dragHandleProps}>
      {canManageColumns ? (
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={() => setRenaming(true)}
            className="hover:bg-wash-strong focus-visible:ring-brand rounded-control flex min-w-0 items-center gap-2 px-1.5 py-1 text-left transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            {label}
          </TooltipTrigger>

          <TooltipContent side="bottom">Rename column</TooltipContent>
        </Tooltip>
      ) : (
        <div
          title={headerTitle}
          className="flex min-w-0 items-center gap-2 px-1.5 py-1"
        >
          {label}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {breach && <LimitWarning message={breach} />}

        {/* fade instead of display:none, so this cluster doesn't reflow the title/count on hover */}
        <div
          className={cn(
            "flex items-center gap-0.5 transition-opacity duration-150",
            menuOpen
              ? "opacity-100"
              : "coarse:pointer-events-auto coarse:opacity-100 pointer-events-none opacity-0 group-focus-within/header:pointer-events-auto group-focus-within/header:opacity-100 group-hover/header:pointer-events-auto group-hover/header:opacity-100",
          )}
        >
          {onAdd && (
            <IconButton label={`Add a card to ${headerTitle}`} onClick={onAdd}>
              <Plus />
            </IconButton>
          )}

          <IconButton label="Collapse column" onClick={onCollapse}>
            <CollapseIcon />
          </IconButton>

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
        "group/header relative flex h-12 shrink-0 items-center justify-between gap-2 px-3",
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
        aria-label="Column name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }

          if (e.key === "Escape") onDone();
        }}
        className="border-brand/60 bg-elevated text-ink rounded-control ring-brand/15 text-meta w-full border px-2 py-1 font-semibold ring-2 outline-none"
      />

      <div
        className={cn(
          POPOVER_PANEL,
          "absolute top-full right-0 z-10 mt-1.5 flex gap-0.5",
        )}
      >
        <IconButton
          label="Save name"
          size="xs"
          tooltip={false}
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
        >
          <Check />
        </IconButton>

        <IconButton
          label="Cancel rename"
          size="xs"
          tooltip={false}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDone}
        >
          <X />
        </IconButton>
      </div>
    </div>
  );
}

/** Two arrows meeting in the middle — lucide has no matching glyph. */
function CollapseIcon() {
  return (
    <svg
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
