import { cn } from "@/utils/cn";

export interface Kpi {
  key: string;
  label: string;
  value: string;
  aside?: string;
  tone?: string;
}

export default function KpiTiles({ items }: { items: Kpi[] }) {
  return (
    <dl className="border-hairline bg-surface rounded-card grid grid-cols-2 border sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.key}
          className="border-hairline min-w-0 border-r border-b px-3.5 py-2.5 last:border-r-0 sm:[&:nth-child(3n)]:border-r-0 xl:[&:nth-child(3n)]:border-r xl:[&:nth-child(5n)]:border-r-0"
        >
          <dt className="text-ink-3 text-micro truncate font-semibold tracking-wide uppercase">
            {item.label}
          </dt>
          <dd
            className={cn(
              "mt-0.5 truncate text-lg leading-tight font-semibold tabular-nums",
              item.tone ?? "text-ink",
            )}
          >
            {item.value}
          </dd>
          <p className="text-ink-3 text-mini h-4 truncate">
            {item.aside ?? " "}
          </p>
        </div>
      ))}
    </dl>
  );
}
