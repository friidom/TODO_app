import type { LucideIcon } from "lucide-react";

import { cn } from "@/utils/cn";

/**
 * Nothing to show, said the same way everywhere.
 *
 * The shape is `ListView`'s own `EmptyList`, promoted: a tinted disc, a title,
 * one line of hint, and at most one quiet action. It was the only view that
 * had an empty state at all — an empty Kanban column showed a blank strip, and
 * an empty Backlog showed nothing under its heading, so two of the three
 * places a new board actually starts from looked broken rather than empty.
 *
 * **No border on the disc.** Every view around it is built out of hairlines,
 * and one more outlined object in the middle of the empty space reads as
 * another control rather than as an illustration.
 *
 * **`size="sm"` is for an empty column**, which is 288px wide and stacked
 * beside three others: the full padding turns four empty columns into a wall of
 * whitespace, and a 40px disc in a 288px column is a target the eye keeps
 * landing on. Same words, same tokens, less of them.
 */
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
  /** One line. Two is a paragraph, and a paragraph in an empty view is unread. */
  hint?: string;
  /** The one thing to do about it, if there is one. */
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
