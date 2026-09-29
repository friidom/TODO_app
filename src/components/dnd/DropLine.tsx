import type { ReactNode } from "react";

import type { Side } from "@/utils/reorder";
import { cn } from "@/utils/cn";

import type { Axis } from "./reorderDnd";

// The insertion line. The parent must be `relative`; the line sits on its
// leading or trailing edge and never takes up layout, so nothing shifts.
export default function DropLine({
  edge,
  axis,
  className,
}: {
  edge: Side | null;
  axis: Axis;
  className?: string;
}) {
  if (!edge) return null;

  return (
    <span
      aria-hidden
      className={cn(
        "bg-brand pointer-events-none absolute z-40 rounded-full",
        axis === "x" ? "inset-y-0 w-0.5" : "inset-x-0 h-0.5",
        axis === "x"
          ? edge === "before"
            ? "-left-px"
            : "-right-px"
          : edge === "before"
            ? "-top-px"
            : "-bottom-px",
        className,
      )}
    />
  );
}

// The overlay a pill-shaped item (tab, toolbar control, column name) follows
// the pointer as.
export function DragChip({ children }: { children: ReactNode }) {
  return (
    <div className="border-hairline bg-elevated text-ink shadow-e2 rounded-control flex h-8 w-max max-w-64 cursor-grabbing items-center gap-1.5 border px-2.5 text-sm font-medium">
      {children}
    </div>
  );
}
