import { XIcon } from "lucide-react";

import { labelTone } from "@/services/todos/labels";
import { cn } from "@/utils/cn";

// Label names are the team's own words and are never translated.
export default function LabelChip({
  name,
  onRemove,
  removeLabel,
  size = "md",
}: {
  name: string;
  onRemove?: () => void;
  removeLabel?: string;
  size?: "sm" | "md";
}) {
  const tone = labelTone(name);

  return (
    <span
      className={cn(
        "text-ink rounded-control inline-flex max-w-full min-w-0 items-center gap-1 font-medium",
        size === "sm" ? "text-micro h-4 px-1" : "text-mini h-6 px-1.5",
        tone.chip,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", tone.dot)}
      />
      <span className="min-w-0 truncate">{name}</span>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className="text-ink-3 hover:text-ink hover:bg-ink/10 focus-visible:ring-brand -mr-0.5 grid size-4 shrink-0 place-items-center rounded-sm outline-none focus-visible:ring-2"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}
