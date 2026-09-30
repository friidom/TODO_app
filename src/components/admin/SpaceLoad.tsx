import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { barShare, peakOf, proportionOf } from "@/services/admin/flow";
import { spaceName, spaceTarget } from "@/services/admin/drilldown";
import type { SpaceMetrics } from "@/services/admin/types";

const TOP = 8;

export default function SpaceLoad({
  spaces,
  period,
  className,
}: {
  spaces: SpaceMetrics[];
  period: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const ranked = [...spaces]
    .sort((a, b) => b.completed_todos - a.completed_todos)
    .slice(0, TOP);

  const peak = peakOf(
    ranked.map((space) => ({ count: space.completed_todos })),
  );
  const total = spaces.reduce((sum, space) => sum + space.completed_todos, 0);

  return (
    <SummaryCard
      title={t("admin.spaceLoad.title")}
      hint={t("admin.topOf", {
        top: Math.min(TOP, ranked.length),
        total: spaces.length,
      })}
      className={className}
    >
      {ranked.length === 0 ? (
        <WidgetEmpty>{t("admin.noSpaces")}</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2 px-3.5 pt-1 pb-3.5">
          {ranked.map((space) => {
            const to = spaceTarget(space, period);

            return (
              <DistributionRow
                key={space.id ?? "unfiled"}
                label={
                  to === null ? (
                    spaceName(space)
                  ) : (
                    <Link
                      to={to}
                      className="hover:text-brand min-w-0 truncate transition-colors"
                    >
                      {spaceName(space)}
                    </Link>
                  )
                }
                title={spaceName(space)}
                count={space.completed_todos}
                percent={barShare(space.completed_todos, peak)}
                share={proportionOf(space.completed_todos, total)}
                barClassName={space.id === null ? "bg-ink-3/50" : "bg-brand/70"}
                labelClassName="flex-[0_0_11rem]"
              />
            );
          })}
        </div>
      )}
    </SummaryCard>
  );
}
