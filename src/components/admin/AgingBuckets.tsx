import { useTranslation } from "react-i18next";
import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { agingRows, totalOf } from "@/services/admin/flow";
import { dayRangeLabel } from "@/services/admin/format";
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
  const { t } = useTranslation();
  const rows = agingRows(buckets);
  const total = totalOf(buckets);

  return (
    <SummaryCard
      title={t("admin.aging.title")}
      hint={t("admin.aging.hint")}
      className={className}
      action={
        <span className="text-ink-3 text-mini tabular-nums">
          {t("admin.aging.inFlight", { count: total })}
        </span>
      }
    >
      {buckets.length === 0 || total === 0 ? (
        <WidgetEmpty>{t("admin.aging.empty")}</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2 px-3.5 pb-3">
          {rows.map(({ bucket, percent, share }) => (
            <DistributionRow
              key={bucket.key}
              label={dayRangeLabel(bucket.label)}
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
