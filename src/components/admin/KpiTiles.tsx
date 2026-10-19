import { cn } from "@/utils/cn";

export interface Kpi {
  key: string;
  label: string;
  value: string;
  aside?: string;
  tone?: string;
}

// The Overview's figures, for a board or a space: number first, label under
// it, dividers drawn by a 1px gap over the hairline. Five figures, so the last
// one spans the gap a short row would leave at two and three columns.
export default function KpiTiles({ items }: { items: Kpi[] }) {
  return (
    <dl className="border-hairline bg-hairline rounded-card grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.key}
          className="bg-surface flex min-w-0 flex-col px-4 pt-3.5 pb-3 last:col-span-2 xl:last:col-span-1"
        >
          <dt className="text-ink-3 text-mini order-2 mt-1 truncate">
            {item.label}
          </dt>
          <dd
            className={cn(
              "order-1 truncate text-2xl font-semibold tracking-tight tabular-nums",
              item.tone ?? "text-ink",
            )}
          >
            {item.value}
          </dd>
          <dd
            className={cn(
              "text-ink-3/80 text-micro order-3 h-3.5 truncate",
              item.aside === undefined && "invisible",
            )}
          >
            {item.aside ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
