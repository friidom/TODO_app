import { useTranslation } from "react-i18next";
import { useState } from "react";

import { categoryOf } from "@/constants/columns";
import type { Slice } from "@/services/views/summary";
import type { IStatus } from "@/types/data";
import { cn } from "@/utils/cn";
import SummaryCard, { WidgetEmpty } from "./SummaryCard";

// hand-drawn SVG donut, not a charting lib — one chart doesn't justify ~90kB of recharts.
// r=15.9155 makes the circumference exactly 100, so stroke-dasharray is already a percentage.

const SHADES = ["opacity-100", "opacity-75", "opacity-50", "opacity-30"];

const LEGEND_WRAP_AT = 6;

export default function StatusOverview({
  slices,
  statuses,
  total,
  done,
  className,
}: {
  slices: Slice<string | null>[];
  statuses: IStatus[];
  total: number;
  done: number;
  className?: string;
}) {
  const { t } = useTranslation();
  // undefined is "nothing highlighted"; null is the real "no status" slice
  const [active, setActive] = useState<string | null | undefined>(undefined);
  const shadeOf = new Map<string, string>();
  const seen = new Map<string, number>();

  for (const status of statuses) {
    const category = categoryOf(status.category);
    const nth = seen.get(category.dot) ?? 0;

    seen.set(category.dot, nth + 1);
    shadeOf.set(status.id, SHADES[Math.min(nth, SHADES.length - 1)]);
  }

  // reduce, not a closure variable accumulated during .map() — a retried/interleaved render can't resume from stale state
  const arcs = slices
    .filter((slice) => slice.count > 0)
    .reduce<{ key: string | null; percent: number; start: number }[]>(
      (acc, slice) => {
        const percent = (slice.count / total) * 100;
        const consumed = acc.reduce((sum, arc) => sum + arc.percent, 0);

        // 25 = quarter turn, puts the start at 12 o'clock once the svg is rotated -90deg
        acc.push({ key: slice.key, percent, start: 25 - consumed });

        return acc;
      },
      [],
    );

  const complete = total === 0 ? 0 : Math.round((done / total) * 100);

  const activeSlice =
    active === undefined ? null : slices.find((slice) => slice.key === active);
  const activeStatus = activeSlice
    ? statuses.find((it) => it.id === activeSlice.key)
    : undefined;
  const nameOf = (key: string | null) =>
    statuses.find((it) => it.id === key)?.name ?? t("status.none");

  const highlight = (key: string | null) => ({
    onPointerEnter: () => setActive(key),
    onPointerLeave: () => setActive(undefined),
  });
  const wrapped = slices.length > LEGEND_WRAP_AT;

  return (
    <SummaryCard
      title={t("summary.workStatus")}
      hint={t("summary.workStatusHint")}
      className={className}
    >
      {total === 0 ? (
        <WidgetEmpty>{t("summary.workStatusEmpty")}</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-3 px-3.5 pb-3">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <div className="relative shrink-0">
              <svg viewBox="0 0 42 42" className="size-24 -rotate-90">
                {/* track, so one status still reads as a ring, not a floating arc */}
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
                  const status = statuses.find((it) => it.id === arc.key);

                  return (
                    <circle
                      {...highlight(arc.key)}
                      key={arc.key ?? "none"}
                      cx="21"
                      cy="21"
                      r="15.9155"
                      fill="none"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      strokeDasharray={`${arc.percent} ${100 - arc.percent}`}
                      strokeDashoffset={arc.start}
                      className={cn(
                        "cursor-default transition-opacity duration-150",
                        status
                          ? categoryOf(status.category).tone
                          : "text-ink-3/50",
                        status ? shadeOf.get(status.id) : undefined,
                        active !== undefined &&
                          active !== arc.key &&
                          "opacity-25",
                      )}
                    >
                      <title>
                        {`${nameOf(arc.key)}: ${t("summary.itemsShare", { count: slices.find((slice) => slice.key === arc.key)?.count ?? 0, percent: Math.round(arc.percent) })}`}
                      </title>
                    </circle>
                  );
                })}
              </svg>

              <div
                aria-live="polite"
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center"
              >
                {activeSlice ? (
                  <>
                    <span className="text-ink text-xl leading-none font-semibold tabular-nums">
                      {activeSlice.count}
                    </span>
                    <span className="text-ink-2 text-micro mt-0.5 max-w-full truncate font-medium">
                      {/* raw, never through t() — a status name is user text */}
                      {activeStatus ? activeStatus.name : t("status.none")}
                    </span>
                    <span className="text-brand text-micro font-semibold tabular-nums">
                      {Math.round((activeSlice.count / total) * 100)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-ink text-xl leading-none font-semibold tabular-nums">
                      {total}
                    </span>
                    <span className="text-ink-3 text-micro mt-0.5">
                      {t("summary.items", { count: total })}
                    </span>
                  </>
                )}
              </div>
            </div>

            <ul
              className={cn(
                "min-w-0 flex-1",
                wrapped ? "gap-x-5 sm:columns-2" : "flex flex-col",
              )}
            >
              {slices.map((slice) => {
                const status = statuses.find((it) => it.id === slice.key);

                return (
                  <li
                    key={slice.key ?? "none"}
                    {...highlight(slice.key)}
                    tabIndex={slice.count > 0 ? 0 : undefined}
                    onFocus={() => setActive(slice.key)}
                    onBlur={() => setActive(undefined)}
                    className={cn(
                      "rounded-control -mx-1.5 flex min-w-0 break-inside-avoid items-center gap-2 px-1.5 py-0.5 transition-colors duration-150 outline-none",
                      slice.count > 0 &&
                        "hover:bg-brand-wash focus-visible:bg-brand-wash focus-visible:ring-brand focus-visible:ring-2",
                      active === slice.key && "bg-brand-wash",
                      slice.count === 0 && "opacity-45",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        status ? categoryOf(status.category).dot : "bg-ink/25",
                        status ? shadeOf.get(status.id) : undefined,
                      )}
                    />

                    {/* raw, never through t() — a status name is user text, not a translation key */}
                    <span className="text-ink-2 min-w-0 flex-1 truncate text-xs">
                      {status ? status.name : t("status.none")}
                    </span>

                    <span className="text-ink shrink-0 text-xs font-medium tabular-nums">
                      {slice.count}
                    </span>

                    <span className="text-ink-3 text-mini w-8 shrink-0 text-right tabular-nums">
                      {Math.round((slice.count / total) * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* done is the status category, not a status literally named "Done" — counts every finished status */}
          <div className="border-hairline flex items-center gap-2.5 border-t pt-2.5">
            <span className="text-ink-3 text-mini shrink-0">
              {t("fields.completed")}
            </span>

            <div className="bg-ink/[0.06] h-1 min-w-0 flex-1 overflow-hidden rounded-full">
              <div
                style={{ width: `${complete}%` }}
                className="bg-status-green h-full rounded-full transition-[width] duration-300"
              />
            </div>

            <span className="text-ink-2 text-mini shrink-0 tabular-nums">
              {t("summary.doneOf", { done, total })}
            </span>

            <span className="text-status-green text-mini w-8 shrink-0 text-right font-medium tabular-nums">
              {complete}%
            </span>
          </div>
        </div>
      )}
    </SummaryCard>
  );
}
