import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

// no flex-1 on the body — used to be, and every widget stretched to the tallest one in the grid row
export default function SummaryCard({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-hairline bg-surface rounded-card flex min-w-0 flex-col border",
        className,
      )}
    >
      <header className="flex items-baseline gap-3 px-3.5 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-ink truncate text-xs font-semibold tracking-tight">
            {title}
          </h2>

          {hint && (
            <p className="text-ink-3 text-mini mt-0.5 truncate">{hint}</p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </header>

      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="text-ink-3 px-4 py-5 text-center text-xs">{children}</p>;
}

// a zero-count row stays visible at half opacity rather than disappearing — the list shouldn't change length as work moves
export function DistributionRow({
  icon,
  label,
  count,
  percent,
  share,
  barClassName,
  labelClassName,
  title,
}: {
  icon?: ReactNode;
  label: ReactNode;
  count: number;
  percent: number;
  share?: number;
  barClassName: string;
  // Board names are longer than the priority and type labels this row was
  // built for, and 6rem cut "Reporting Pipeline" to "Reporting Pipeli…".
  labelClassName?: string;
  title?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", count === 0 && "opacity-45")}>
      <div
        className={cn(
          "flex min-w-0 flex-[0_0_6rem] items-center gap-1.5",
          labelClassName,
        )}
      >
        {icon}
        <span className="text-ink-2 min-w-0 truncate text-xs" title={title}>
          {label}
        </span>
      </div>

      <div className="bg-ink/[0.06] h-1 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          style={{ width: `${percent}%` }}
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            barClassName,
          )}
        />
      </div>

      <span className="text-ink w-6 shrink-0 text-right text-xs font-medium tabular-nums">
        {count}
      </span>

      <span className="text-ink-3 text-mini w-8 shrink-0 text-right tabular-nums">
        {share === undefined ? "" : `${Math.round(share)}%`}
      </span>
    </div>
  );
}
