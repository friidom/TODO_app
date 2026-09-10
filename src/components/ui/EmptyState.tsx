import type { LucideIcon } from "lucide-react";

import { cn } from "@/utils/cn";

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: { label: string; run: () => void };
  size?: "sm" | "md";
  className?: string;
}) {
  const sm = size === "sm";

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        sm ? "gap-0.5 px-3 py-7" : "gap-1 px-6 py-16",
        className,
      )}
    >
      <span
        className={cn(
          "bg-ink/[0.06] text-ink-3 grid place-items-center rounded-full",
          sm ? "mb-2 size-8" : "mb-3 size-10",
        )}
      >
        <Icon className={sm ? "size-3.5" : "size-4"} />
      </span>

      <p className={cn("text-ink font-medium", sm ? "text-xs" : "text-sm")}>
        {title}
      </p>

      {hint && (
        <p className={cn("text-ink-3 max-w-xs", sm ? "text-mini" : "text-xs")}>
          {hint}
        </p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.run}
          className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control mt-3 px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
