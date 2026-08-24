import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

/**
 * The shell every Summary widget wears (M18).
 *
 * **This is the whole of the "widget system", deliberately.** The brief asked
 * for the Summary to be easy to extend, and the cheapest thing that achieves it
 * is a shared card and a grid — not a registry, a layout engine or a
 * configurable dashboard. Adding a widget later is: write a component, wrap it
 * in this, give it a span. A framework would be a second thing to learn before
 * writing the component, for a page with seven of them.
 *
 * **The body is NOT `flex-1`, and that is load-bearing.** It used to be, which
 * meant every widget grew to fill whatever height the grid row handed it — and
 * a grid row is as tall as its tallest member. A donut beside a feed was
 * stretched to the feed's height and the difference was blank surface at the
 * bottom of the card. Nothing here grows: height comes from content, and the
 * grid is `items-start` so it stays that way.
 *
 * `bg-surface` on `bg-canvas`, one hairline, `rounded-card`: the same three
 * decisions the board's columns and the profile's sections already make, so the
 * Summary reads as part of the product rather than as a dashboard bolted onto
 * it. `rounded-card` (10px) rather than `rounded-surface` (14px) — it is the
 * radius `TodoCard` and `KanbanColumn` wear, and the softer one on seven panels
 * read as seven large pillows.
 */
export default function SummaryCard({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  /**
   * One muted line under the title.
   *
   * **Two widgets pass it, and both earn it.** Every widget carried a sentence
   * once, which is a paragraph of chrome above numbers that explain themselves;
   * these two are the exceptions. Work status uses it as a hierarchy device —
   * the panel the page opens with. Activity trends uses it to state what the
   * blue line actually counts, which is the difference between a chart and a
   * chart you can trust. Neither is decoration, and a third caller should have
   * as good a reason.
   */
  hint?: string;
  /** A link or figure on the title row — "View all", "3 overdue", nothing bigger. */
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

/**
 * What a widget renders when the board has nothing for it yet.
 *
 * Shared rather than written seven times, because a board with three cards hits
 * several of these at once and they have to look like one decision. One quiet
 * line at `py-5`: a widget with nothing to say should be the shortest thing on
 * the page, not the tallest. It was `py-10` around an illustrated disc, which
 * made an empty board the most padded one.
 */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="text-ink-3 px-4 py-5 text-center text-xs">{children}</p>;
}

/**
 * One labelled row of a horizontal breakdown: icon, name, bar, count, share.
 *
 * Three lists draw exactly this — priority, work type and assignee — so the
 * bar's metrics, its animation and its zero state are decided once. The bar is
 * scaled by the caller against whatever it considers full, because "share of
 * the largest row" and "share of the total" are different questions and both
 * are asked here.
 *
 * **One line, and thin.** The row is the widget: there is no plotting area, no
 * axis and no legend, so a breakdown of four categories is four lines tall and
 * nothing else. A 6px bar in a 28px row was a chart pretending to need the
 * space.
 *
 * **A row that is zero is drawn at half ink rather than dropped.** "No bugs on
 * this board" is a fact, and a category that disappears when it empties makes
 * the list change length as work moves, which is the one thing a breakdown
 * must not do.
 */
export function DistributionRow({
  icon,
  label,
  count,
  percent,
  share,
  barClassName,
}: {
  icon?: ReactNode;
  label: ReactNode;
  count: number;
  /** Bar width, 0–100, already resolved by the caller. */
  percent: number;
  /** Share of the whole, 0–100. Omitted where the widget has no meaningful total. */
  share?: number;
  barClassName: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", count === 0 && "opacity-45")}>
      <div className="flex min-w-0 flex-[0_0_6rem] items-center gap-1.5">
        {icon}
        <span className="text-ink-2 min-w-0 truncate text-xs">{label}</span>
      </div>

      {/* The track is always full width so the rows line up whatever they hold,
          and an empty category renders a track rather than a gap. */}
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

      {/* Fixed width whether or not it is filled, so the counts stay in one
          column across widgets that do and do not report a share. */}
      <span className="text-ink-3 text-mini w-8 shrink-0 text-right tabular-nums">
        {share === undefined ? "" : `${Math.round(share)}%`}
      </span>
    </div>
  );
}
