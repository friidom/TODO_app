import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

// The axis sits on the right, each value centred on its line. `headroom` is the
// share of the plot an SVG chart leaves above its peak, so the top value lines
// up with the line drawn at the peak rather than with the plot's edge. `grid`
// draws dashed lines for plots that do not draw their own.
export default function ChartFrame({
  axis,
  labels,
  labelStep = 1,
  highlight = null,
  plotClassName = "h-40",
  headroom = 0,
  grid = false,
  children,
}: {
  axis: string[];
  labels: string[];
  labelStep?: number;
  highlight?: number | null;
  plotClassName?: string;
  headroom?: number;
  grid?: boolean;
  children: ReactNode;
}) {
  const at = (index: number) =>
    `${(headroom + (index / Math.max(1, axis.length - 1)) * (1 - headroom)) * 100}%`;

  return (
    <div className="px-3.5 pb-3">
      <div className="flex gap-2.5">
        <div className={cn("relative min-w-0 flex-1", plotClassName)}>
          {grid &&
            axis.map((value, index) => (
              <span
                key={`${value}-${index}`}
                aria-hidden
                style={{ top: at(index) }}
                className={cn(
                  "pointer-events-none absolute inset-x-0 border-t",
                  index === axis.length - 1
                    ? "border-ink/15"
                    : "border-ink/10 border-dashed",
                )}
              />
            ))}

          {children}
        </div>

        <div
          className={cn(
            "text-ink-3/80 text-micro relative w-9 shrink-0 tabular-nums",
            plotClassName,
          )}
        >
          {axis.map((value, index) => (
            <span
              key={`${value}-${index}`}
              style={{ top: at(index) }}
              className="absolute left-0 -translate-y-1/2 leading-none"
            >
              {value}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2 flex pr-[2.875rem]">
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className={cn(
              "text-micro min-w-0 flex-1 truncate text-center transition-colors",
              index === highlight ? "text-ink font-medium" : "text-ink-3/80",
            )}
          >
            {index === highlight || index % labelStep === 0 ? label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
