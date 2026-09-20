import SummaryCard from "@/components/summary/SummaryCard";
import { dash, percent } from "@/services/admin/format";
import type { AdminUser } from "@/services/admin/types";
import { cn } from "@/utils/cn";

export default function BulletBar({
  user,
  periodLabel,
  className,
}: {
  user: AdminUser;
  periodLabel: string;
  className?: string;
}) {
  const target = user.target_points;
  const actual = user.completed_points;

  // Scaled past the target so an over-achieving bar has somewhere to go and
  // does not pin at 100% looking exactly like someone who just met it.
  const ceiling = Math.max(actual, target ?? 0, 1) * 1.1;

  const share = (value: number) => `${Math.min(100, (value / ceiling) * 100)}%`;

  return (
    <SummaryCard
      title="Target vs actual"
      hint={
        target === null
          ? "No level set, so no target — the facts below are unaffected"
          : `${periodLabel} · target scaled from the weekly figure`
      }
      className={className}
    >
      <div className="flex flex-col gap-2.5 px-3.5 pt-1 pb-3.5">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              target === null ? "text-ink-3" : "text-ink",
            )}
          >
            {percent(user.performance)}
          </span>

          <span className="text-ink-3 text-mini">
            {dash(actual)} of {dash(target)} points
          </span>
        </div>

        <div className="bg-ink/[0.06] relative h-2 overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-200",
              target === null || user.performance === null
                ? "bg-ink-3/50"
                : user.performance >= 100
                  ? "bg-status-green"
                  : "bg-brand",
            )}
            style={{ width: share(actual) }}
          />

          {target !== null && target > 0 && (
            <span
              aria-hidden
              className="bg-ink absolute inset-y-0 w-0.5"
              style={{ left: share(target) }}
            />
          )}
        </div>

        <p className="text-ink-3 text-mini">
          {user.unestimated_completed > 0
            ? `${user.unestimated_completed} completed task${user.unestimated_completed === 1 ? "" : "s"} carried no estimate and count toward neither figure.`
            : "Every completed task in this period carried an estimate."}
        </p>
      </div>
    </SummaryCard>
  );
}
