import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

export default function ChartFrame({
  axis,
  labels,
  labelStep = 1,
  highlight = null,
  plotClassName = "h-40",
  children,
}: {
  axis: string[];
  labels: string[];
  labelStep?: number;
  highlight?: number | null;
  plotClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-3.5 pb-3">
      <div className="flex gap-2.5">
        <div
          className={cn(
            "text-ink-3/70 text-micro flex w-9 shrink-0 flex-col justify-between text-right tabular-nums",
            plotClassName,
          )}
        >
          {axis.map((value, index) => (
            <span key={`${value}-${index}`}>{value}</span>
          ))}
        </div>

        <div className={cn("relative min-w-0 flex-1", plotClassName)}>
          {children}
        </div>
      </div>

      <div className="mt-1.5 flex pl-[2.875rem]">
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className={cn(
              "text-micro min-w-0 flex-1 truncate text-center transition-colors",
              index === highlight ? "text-ink font-medium" : "text-ink-3/70",
            )}
          >
            {index === highlight || index % labelStep === 0 ? label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
