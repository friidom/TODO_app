import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

/**
 * The shell every Summary widget wears (M18).
 *
 * **This is the whole of the "widget system", deliberately.** The brief asked
 * for the Summary to be easy to extend, and the cheapest thing that achieves it
 * is a shared card and a grid — not a registry, a layout engine or a
 * configurable dashboard. Adding a widget later is: write a component, wrap it
 * in this, drop it in the grid. A framework would be a second thing to learn
 * before writing the component, for a page with six of them.
 *
 * `bg-surface` on `bg-canvas`, one hairline, `rounded-surface`: the same three
 * decisions the board's columns and the profile's sections already make, so the
 * Summary reads as part of the product rather than as a dashboard bolted onto
 * it.
 */
export default function SummaryCard({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  /** One line under the title. Omitted when the chart says it already. */
  hint?: string;
  /** A link or control on the title row — "View all items", and nothing bigger. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-hairline bg-surface rounded-surface flex min-w-0 flex-col border",
        className,
      )}
    >
      <header className="flex items-baseline gap-3 px-4 pt-3.5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-ink text-[13px] font-semibold tracking-tight">
            {title}
          </h2>

          {hint && <p className="text-ink-3 mt-0.5 text-xs">{hint}</p>}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </header>

      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/**
 * What a widget renders when the board has nothing for it yet.
 *
 * Shared rather than written six times, because a board with three cards hits
 * several of these at once and they have to look like one decision. Sized to sit
 * where the chart would, so a card does not collapse to a title bar.
 */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-3 px-4 py-10 text-center text-xs">{children}</p>
  );
}

/**
 * One labelled row of a horizontal breakdown: icon, name, bar, count.
 *
 * Three widgets draw exactly this — priority, work type and workload — so the
 * bar's metrics, its animation and its zero state are decided once. The bar is
 * scaled by the caller against whatever it considers full, because "share of
 * the largest row" and "share of the total" are different questions and both
 * are asked here.
 */
export function DistributionRow({
  icon,
  label,
  count,
  percent,
  barClassName,
}: {
  icon?: ReactNode;
  label: ReactNode;
  count: number;
  /** 0–100, already resolved by the caller. */
  percent: number;
  barClassName: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex min-w-0 flex-[0_0_7.5rem] items-center gap-1.5">
        {icon}
        <span className="text-ink-2 min-w-0 truncate text-xs">{label}</span>
      </div>

      {/* The track is always full width so the rows line up whatever they hold,
          and an empty category renders a track rather than a gap. */}
      <div className="bg-ink/[0.06] h-2 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          style={{ width: `${percent}%` }}
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            barClassName,
          )}
        />
      </div>

      <span className="text-ink-2 w-7 shrink-0 text-right text-xs tabular-nums">
        {count}
      </span>
    </div>
  );
}
