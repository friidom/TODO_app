import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const target = user.target_points;
  const actual = user.completed_points;

  // Scaled past the target so an over-achieving bar has somewhere to go and
  // does not pin at 100% looking exactly like someone who just met it.
  const ceiling = Math.max(actual, target ?? 0, 1) * 1.1;

  const share = (value: number) => `${Math.min(100, (value / ceiling) * 100)}%`;

  return (
    <SummaryCard
      title={t("admin.bullet.title")}
      hint={
        target === null
          ? t("admin.bullet.noLevel")
          : t("admin.bullet.scaled", { period: periodLabel })
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
            {t("admin.bullet.ofPoints", {
              actual: dash(actual),
              target: dash(target),
            })}
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
            ? t("admin.bullet.unestimated", {
                count: user.unestimated_completed,
              })
            : t("admin.bullet.allEstimated")}
        </p>
      </div>
    </SummaryCard>
  );
}
