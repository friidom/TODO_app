import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { proportionOf, wipTotal } from "@/services/admin/flow";
import type { WipSlice } from "@/services/admin/types";
import { cn } from "@/utils/cn";

const TONES: Record<WipSlice["category"], string> = {
  todo: "bg-ink-3/45",
  in_progress: "bg-brand/80",
  in_review: "bg-status-orange/70",
  done: "bg-status-green/70",
  none: "bg-ink/[0.08]",
};

export default function WipStrip({
  slices,
  scopeHint,
  className,
}: {
  slices: WipSlice[];
  scopeHint?: string;
  className?: string;
}) {
  const total = wipTotal(slices);
  const present = slices.filter((slice) => slice.count > 0);

  return (
    <SummaryCard
      title="Work in progress"
      hint={scopeHint ?? "Every open card, by the stage it is sitting at"}
      className={className}
      action={
        <span className="text-ink-3 text-mini tabular-nums">{total} open</span>
      }
    >
      {total === 0 ? (
        <WidgetEmpty>Nothing is open right now.</WidgetEmpty>
      ) : (
        <div className="px-3.5 pb-3.5">
          <div
            className="bg-ink/[0.06] flex h-2.5 overflow-hidden rounded-full"
            role="img"
            aria-label={slices
              .map((slice) => `${slice.label}: ${slice.count}`)
              .join(", ")}
          >
            {present.map((slice) => (
              <span
                key={slice.key}
                title={`${slice.label} — ${slice.count}`}
                style={{ width: `${proportionOf(slice.count, total)}%` }}
                className={cn(
                  "h-full first:rounded-l-full last:rounded-r-full",
                  TONES[slice.category],
                )}
              />
            ))}
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {slices.map((slice) => (
              <div
                key={slice.key}
                className={cn("min-w-0", slice.count === 0 && "opacity-45")}
              >
                <dt className="text-ink-3 text-mini flex items-center gap-1.5 truncate">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      TONES[slice.category],
                    )}
                  />
                  {slice.label}
                </dt>
                <dd className="text-ink mt-0.5 text-sm font-medium tabular-nums">
                  {slice.count}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </SummaryCard>
  );
}
