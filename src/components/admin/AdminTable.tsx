import type { KeyboardEvent, ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { dash } from "@/services/admin/format";
import { cn } from "@/utils/cn";

// An ARIA grid over a CSS grid template, not a <table>: these tables hide
// columns with responsive classes on both the header and the row, and a
// colgroup's widths fall out of step with the cells as soon as they do. The
// List left this pattern when its columns became data rather than lg: classes
// — see services/views/listColumns.ts — which is a move available to any of
// these that grows the same need.
// `embedded` drops the grid's own frame so it can sit under a SummaryCard's
// header, the way every other admin section is titled.
// `narrow` is for a grid in a half-width card: the default minimum is wider
// than one, and pushed its last column out of view.
export function AdminGrid({
  columns,
  children,
  label,
  embedded = false,
  narrow = false,
}: {
  columns: string;
  children: ReactNode;
  label: string;
  embedded?: boolean;
  narrow?: boolean;
}) {
  return (
    <div
      role="table"
      aria-label={label}
      className={cn(
        "border-hairline min-w-0 overflow-x-auto",
        embedded ? "rounded-b-card border-t" : "bg-surface rounded-card border",
      )}
      style={{ ["--admin-cols" as string]: columns }}
    >
      <div role="rowgroup" className={narrow ? "min-w-120" : "min-w-208"}>
        {children}
      </div>
    </div>
  );
}

export function AdminRow({
  children,
  header = false,
  onOpen,
  className,
}: {
  children: ReactNode;
  header?: boolean;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <div
      role="row"
      {...(onOpen && {
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;

          event.preventDefault();
          onOpen();
        },
      })}
      className={cn(
        "border-hairline grid items-center gap-3 px-3.5",
        "grid-cols-(--admin-cols)",
        header
          ? "bg-wash text-ink-3 text-mini border-b py-1.5 font-medium"
          : "hover:bg-wash text-meta min-h-10 border-b py-2 transition-colors last:border-b-0",
        onOpen &&
          "focus-visible:ring-brand/40 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminCell({
  children,
  header = false,
  align = "left",
  className,
}: {
  children: ReactNode;
  header?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <div
      role={header ? "columnheader" : "cell"}
      className={cn(
        "min-w-0 truncate",
        header && "text-mini font-medium",
        align === "right" && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminSortButton({
  active,
  onClick,
  direction = "desc",
  children,
}: {
  active: boolean;
  onClick: () => void;
  direction?: "asc" | "desc";
  children: ReactNode;
}) {
  const Arrow = direction === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "hover:text-ink inline-flex items-center gap-1 transition-colors",
        active && "text-ink",
      )}
    >
      {children}
      {active && <Arrow aria-hidden className="size-3 shrink-0" />}
    </button>
  );
}

// A zero sits back so the rows that moved stand out in a quiet period.
export function AdminNumber({ value }: { value: number | null }) {
  return (
    <span
      className={value === 0 || value === null ? "text-ink-3/70" : "text-ink"}
    >
      {dash(value)}
    </span>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="text-ink-3 px-4 py-8 text-center text-xs">{children}</p>;
}

// Holds the height a table will take, so the page does not jump from a short
// empty state to a long list on first load.
export function AdminSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border-hairline bg-surface rounded-card overflow-hidden border">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="border-hairline flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0"
        >
          <span className="skeleton h-3 w-40 rounded" />
          <span className="skeleton h-3 flex-1 rounded" />
          <span className="skeleton h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}
