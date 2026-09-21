import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { agingRows, totalOf } from "@/services/admin/flow";
import type { AgingBucket } from "@/services/admin/types";

const TONES: Record<string, string> = {
  "0-2": "bg-status-green/70",
  "3-7": "bg-status-green/50",
  "8-14": "bg-status-orange/50",
  "15-30": "bg-status-orange/70",
  "30+": "bg-status-red/60",
};

export default function AgingBuckets({
  buckets,
  note,
  className,
}: {
  buckets: AgingBucket[];
  note?: string;
  className?: string;
}) {
  const rows = agingRows(buckets);
  const total = totalOf(buckets);

  return (
    <SummaryCard
      title="WIP aging"
      hint="How long the work now in progress has been in progress"
      className={className}
      action={
        <span className="text-ink-3 text-mini tabular-nums">
          {total} in flight
        </span>
      }
    >
      {buckets.length === 0 || total === 0 ? (
        <WidgetEmpty>Nothing is in progress right now.</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2 px-3.5 pb-3">
          {rows.map(({ bucket, percent, share }) => (
            <DistributionRow
              key={bucket.key}
              label={bucket.label}
              count={bucket.count}
              percent={percent}
              share={share}
              barClassName={TONES[bucket.key] ?? "bg-brand/70"}
              labelClassName="flex-[0_0_4rem]"
            />
          ))}

          {note && <p className="text-ink-3 text-mini pt-1">{note}</p>}
        </div>
      )}
    </SummaryCard>
  );
}
