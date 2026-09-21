import { tooltipAnchor } from "./hover";
import { cn } from "@/utils/cn";

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  tone?: string;
  muted?: boolean;
}

export default function ChartTooltip({
  index,
  count,
  title,
  rows,
  footer,
}: {
  index: number;
  count: number;
  title: string;
  rows: TooltipRow[];
  footer?: { label: string; value: string };
}) {
  const { left, flip } = tooltipAnchor(index, count);

  return (
    <div
      aria-hidden
      style={{ left: `${left}%` }}
      className={cn(
        "pointer-events-none absolute top-1 z-10 min-w-36",
        flip ? "-translate-x-[calc(100%+10px)]" : "translate-x-2.5",
      )}
    >
      <div className="border-hairline bg-elevated shadow-e2 rounded-card border px-2.5 py-2">
        <p className="text-ink text-mini mb-1.5 font-medium">{title}</p>

        <dl className="flex flex-col gap-1">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3">
              {row.tone && (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full bg-current",
                    row.tone,
                  )}
                />
              )}
              <dt
                className={cn(
                  "text-micro flex-1",
                  row.muted ? "text-ink-3" : "text-ink-2",
                )}
              >
                {row.label}
              </dt>
              <dd className="text-ink text-mini tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>

        {footer && (
          <div className="border-hairline mt-1.5 flex items-center gap-3 border-t pt-1.5">
            <span className="text-ink-3 text-micro flex-1">{footer.label}</span>
            <span className="text-ink text-mini font-medium tabular-nums">
              {footer.value}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
