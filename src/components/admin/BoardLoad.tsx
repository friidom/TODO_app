import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import type { AdminBoard } from "@/services/admin/types";

const TOP = 10;

export default function BoardLoad({
  boards,
  period,
  className,
}: {
  boards: AdminBoard[];
  period: string;
  className?: string;
}) {
  const { t } = useTranslation();
  // Only boards that finished something: a list of faded zeros is noise, and
  // the hint still says how many of the whole set delivered.
  const delivering = boards.filter((board) => board.completed_todos > 0);
  const ranked = delivering
    .sort((a, b) => b.completed_todos - a.completed_todos)
    .slice(0, TOP);

  const total = boards.reduce((sum, board) => sum + board.completed_todos, 0);
  const peak = ranked.reduce(
    (highest, board) => Math.max(highest, board.completed_todos),
    0,
  );

  return (
    <SummaryCard
      title={t("admin.boardLoad.title")}
      hint={t("admin.loadHint", {
        active: delivering.length,
        total: boards.length,
      })}
      className={className}
    >
      {boards.length === 0 ? (
        <WidgetEmpty>{t("sidebar.noBoardsYet")}</WidgetEmpty>
      ) : ranked.length === 0 ? (
        <WidgetEmpty>{t("admin.loadEmpty")}</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2 px-3.5 pt-1 pb-3.5">
          {ranked.map((board) => (
            <DistributionRow
              key={board.id}
              label={
                <Link
                  to={`/admin/boards/${board.id}?period=${period}`}
                  className="hover:text-brand min-w-0 truncate transition-colors"
                >
                  {board.title ?? t("common.untitledBoard")}
                </Link>
              }
              count={board.completed_todos}
              percent={peak === 0 ? 0 : (board.completed_todos / peak) * 100}
              share={total === 0 ? 0 : (board.completed_todos / total) * 100}
              barClassName="bg-brand"
              labelClassName="flex-[0_0_11rem]"
              title={board.title ?? t("common.untitledBoard")}
            />
          ))}
        </div>
      )}
    </SummaryCard>
  );
}
