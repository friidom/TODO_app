import { cn } from "@/utils/cn";

// One choice out of a few, shown all at once. The chosen one is raised rather
// than brand-filled: brand marks navigation, and this is a filter.
// `sm` is the size inside a card's header, beside its title.
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
}: {
  label: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (next: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "border-hairline bg-surface rounded-control flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto border p-0.5",
        size === "sm" ? "h-7" : "h-8",
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          title={option.title}
          className={cn(
            "text-ink-3 hover:text-ink focus-visible:ring-brand h-full shrink-0 rounded-md whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
            size === "sm" ? "text-mini px-2" : "text-meta px-2.5",
            option.value === value &&
              "bg-elevated text-ink shadow-e1 font-medium",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
