import { categoryOf } from "@/constants/columns";
import { cn } from "@/utils/cn";

export default function CategoryPill({
  title,
  category,
  className,
}: {
  title: string;
  category?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-wash-strong text-ink rounded-control text-mini inline-flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 font-semibold tracking-wide uppercase",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          categoryOf(category).dot,
        )}
      />

      <span className="truncate">{title}</span>
    </span>
  );
}
