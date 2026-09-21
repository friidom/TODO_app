import { cn } from "@/utils/cn";

export interface LegendItem {
  key: string;
  label: string;
  tone: string;
}

export default function ChartLegend({
  items,
  hidden,
  onToggle,
}: {
  items: LegendItem[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Series"
      className="flex flex-wrap items-center gap-2.5"
    >
      {items.map((item) => {
        const off = hidden.has(item.key);

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            aria-pressed={!off}
            className={cn(
              "text-mini flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors",
              off ? "text-ink-3/60" : "text-ink-2 hover:text-ink",
            )}
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-[3px] transition-colors",
                off ? "bg-ink-3/30" : cn("bg-current", item.tone),
              )}
            />
            <span className={off ? "line-through" : undefined}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
