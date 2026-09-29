import { categoryOf, type ColumnCategory } from "@/constants/columns";
import { cn } from "@/utils/cn";

export default function StatusLozenge({
  name,
  category,
  hidden = false,
}: {
  name: string;
  category: ColumnCategory;
  hidden?: boolean;
}) {
  return (
    <span
      className={cn(
        "text-ink text-mini inline-flex h-5 max-w-full min-w-0 items-center rounded border px-1.5 font-semibold tracking-wide uppercase",
        categoryOf(category).lozenge,
        hidden && "opacity-60",
      )}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}
