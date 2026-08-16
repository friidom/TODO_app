import { categoryOf, columnTitle } from "@/constants/columns";
import type { Slice } from "@/services/views/summary";
import type { IColumn } from "@/types/data";
import { cn } from "@/utils/cn";
import SummaryCard, { WidgetEmpty } from "./SummaryCard";

/**
 * A donut, drawn in SVG, and the reason it is not a library (M18).
 *
 * One chart does not justify a charting dependency — the brief says so and it
 * is the right call: recharts is ~90kB gzipped and brings its own theming,
 * fonts and animation opinions to a product that has all three already. This is
 * one `<circle>` per slice with a `stroke-dasharray`, which is the whole
 * technique.
 *
 * **The `r = 15.9155` is not arbitrary.** `2πr` at that radius is 100, so a
 * dash array is expressed directly in *percent* and no segment maths is needed
 * beyond a running total. `-90deg` rotation starts the first slice at twelve
 * o'clock, which is where a reader expects it.
 *
 * **Per column, not per category**, because the board's statuses *are* its
 * columns — collapsing "In Progress" and "In Review" into one arc would answer
 * a question the board does not ask. Two columns sharing a category share its
 * colour and are stepped apart by opacity, so the palette still means what it
 * means everywhere else in the product.
 *
 * **The legend goes two-up past six statuses.** A board with nine columns drew
 * a nine-row list beside a ring, which made the card twice as tall as the one
 * next to it and left its right half empty. Two columns is the same information
 * in half the height, and the threshold is the point where the list stops being
 * shorter than the ring.
 */

/** How far each successive column of the same category fades. */
const SHADES = ["opacity-100", "opacity-75", "opacity-50", "opacity-30"];

/** Past this many statuses the legend splits into two columns. */
const LEGEND_WRAP_AT = 6;

export default function StatusOverview({
  slices,
  columns,
  total,
  done,
}: {
  slices: Slice<string | null>[];
  columns: IColumn[];
  total: number;
  /** Items in a `done` column. Feeds the progress line at the foot, nothing else. */
  done: number;
}) {
  // Which shade each column takes: its index among the columns that share its
  // category. Computed here rather than in the pure module because it is a
  // presentation decision, and the pure module holds no colours.
  const shadeOf = new Map<string, string>();
  const seen = new Map<string, number>();

  for (const column of columns) {
    const category = categoryOf(column.category);
    const nth = seen.get(category.dot) ?? 0;

    seen.set(category.dot, nth + 1);
    shadeOf.set(column.id, SHADES[Math.min(nth, SHADES.length - 1)]);
  }

  /**
   * The arcs, with each one's start already resolved.
   *
   * Computed up front rather than by carrying a running total through the
   * `.map()` below: accumulating into a closure variable while rendering is the
   * shape `react-hooks/immutability` flags, and it is right to — a render that
   * is retried or interleaved would resume from a total left behind by the last
   * attempt. A `reduce` says the same thing and cannot.
   */
  const arcs = slices
    .filter((slice) => slice.count > 0)
    .reduce<{ key: string | null; percent: number; start: number }[]>(
      (acc, slice) => {
        const percent = (slice.count / total) * 100;
        const consumed = acc.reduce((sum, arc) => sum + arc.percent, 0);

        // `25` puts the start of the arc at twelve o'clock once the whole svg
        // is rotated -90deg.
        acc.push({ key: slice.key, percent, start: 25 - consumed });

        return acc;
      },
      [],
    );

  const complete = total === 0 ? 0 : Math.round((done / total) * 100);
  const wrapped = slices.length > LEGEND_WRAP_AT;

  return (
    <SummaryCard
      title="Status overview"
      hint="Where the work on this board currently sits."
    >
      {total === 0 ? (
        <WidgetEmpty>No work items on this board yet.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
          <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:gap-5">
            <div className="relative shrink-0">
              <svg viewBox="0 0 42 42" className="size-32 -rotate-90">
                {/* The track, so a board with one status still reads as a ring
                    rather than as an arc floating in space. */}
                <circle
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="none"
                  strokeWidth="3.5"
                  className="text-ink/[0.07]"
                  stroke="currentColor"
                />

                {arcs.map((arc) => {
                  const column = columns.find((it) => it.id === arc.key);

                  return (
                    <circle
                      key={arc.key ?? "none"}
                      cx="21"
                      cy="21"
                      r="15.9155"
                      fill="none"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      // The circumference at r=15.9155 is 100, so the dash
                      // array is already a percentage and needs no conversion.
                      strokeDasharray={`${arc.percent} ${100 - arc.percent}`}
                      strokeDashoffset={arc.start}
                      className={cn(
                        column
                          ? categoryOf(column.category).tone
                          : "text-ink-3/50",
                        column ? shadeOf.get(column.id) : undefined,
                      )}
                    />
                  );
                })}
              </svg>

              {/* Centred over the ring rather than inside the SVG: a
                  foreignObject would not inherit the page's font, and a <text>
                  would not wrap. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-ink text-2xl leading-none font-semibold tabular-nums">
                  {total}
                </span>
                <span className="text-ink-3 mt-1 text-[11px]">
                  {total === 1 ? "work item" : "work items"}
                </span>
              </div>
            </div>

            <ul
              className={cn(
                "min-w-0 flex-1",
                wrapped ? "gap-x-6 sm:columns-2" : "flex flex-col gap-1.5",
              )}
            >
              {slices.map((slice) => {
                const column = columns.find((it) => it.id === slice.key);

                return (
                  <li
                    key={slice.key ?? "none"}
                    className={cn(
                      "flex min-w-0 break-inside-avoid items-center gap-2",
                      wrapped && "py-0.5",
                      // An empty column is part of the board's shape and stays
                      // listed, but it is not something to look at.
                      slice.count === 0 && "opacity-55",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        column ? categoryOf(column.category).dot : "bg-ink/25",
                        column ? shadeOf.get(column.id) : undefined,
                      )}
                    />

                    {/* Raw, never through `t()`: a column title is
                        user-editable text, and running it through i18n was the
                        M2-20 bug that made a column called "todo" render as a
                        translation key. */}
                    <span className="text-ink-2 min-w-0 flex-1 truncate text-xs">
                      {column ? columnTitle(column.title) : "No status"}
                    </span>

                    <span className="text-ink shrink-0 text-xs font-medium tabular-nums">
                      {slice.count}
                    </span>

                    <span className="text-ink-3 w-8 shrink-0 text-right text-[11px] tabular-nums">
                      {Math.round((slice.count / total) * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* THE ONE THING THE RING CANNOT SHOW. The donut is composition —
              which status holds what — and says nothing about progress, because
              "done" is one arc among several and reads as just another colour.
              This is the same data asked the other way, and it is the line
              somebody actually reports upward.

              `done` is the CATEGORY, not a column named Done: doneness has been
              `columns.category === 'done'` since M2 removed `todos.completed`,
              so a board with two finished columns counts both — and this figure
              is the one `summaryStats` already computes for the metric strip,
              passed in rather than recounted, so the two cannot disagree. */}
          <div className="border-hairline flex items-center gap-3 border-t pt-3">
            <span className="text-ink-3 shrink-0 text-[11px]">Completed</span>

            <div className="bg-ink/[0.06] h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
              <div
                style={{ width: `${complete}%` }}
                className="bg-status-green h-full rounded-full transition-[width] duration-300"
              />
            </div>

            <span className="text-ink-2 shrink-0 text-[11px] tabular-nums">
              {done} of {total}
            </span>

            <span className="text-status-green w-8 shrink-0 text-right text-[11px] font-medium tabular-nums">
              {complete}%
            </span>
          </div>
        </div>
      )}
    </SummaryCard>
  );
}
