import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

// An ARIA grid over a CSS grid template, not a <table> — the reason
// components/views/listGrid.ts already records: a colgroup's widths and the
// row's cells fall out of step once columns drop below lg.
export function AdminGrid({
  columns,
  children,
  label,
}: {
  columns: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      role="table"
      aria-label={label}
      className="border-hairline bg-surface rounded-card min-w-0 overflow-x-auto border"
      style={{ ["--admin-cols" as string]: columns }}
    >
      <div role="rowgroup" className="min-w-208">
        {children}
      </div>
    </div>
  );
}

export function AdminRow({
  children,
  header = false,
  className,
}: {
  children: ReactNode;
  header?: boolean;
  className?: string;
}) {
  return (
    <div
      role="row"
      className={cn(
        "border-hairline grid items-center gap-3 px-3.5",
        "grid-cols-(--admin-cols)",
        header
          ? "text-ink-3 text-micro border-b py-2 font-semibold tracking-wide uppercase"
          : "hover:bg-wash text-meta border-b py-2.5 transition-colors last:border-b-0",
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
        header && "text-micro font-semibold tracking-wide uppercase",
        align === "right" && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </div>
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
          <span className="bg-ink/[0.06] h-3 w-40 animate-pulse rounded" />
          <span className="bg-ink/[0.04] h-3 flex-1 animate-pulse rounded" />
          <span className="bg-ink/[0.04] h-3 w-16 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
