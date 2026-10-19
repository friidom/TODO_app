import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
} from "@/components/admin/AdminTable";
import SummaryCard from "@/components/summary/SummaryCard";
import { taskTarget } from "@/services/admin/drilldown";
import { actionLabel } from "@/services/admin/format";
import type { AdminActivityRow } from "@/services/admin/types";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

export default function RecentActivityCard({
  rows,
  loading = false,
  label,
  seeAll,
  onOpen,
  showBoard = true,
  className,
}: {
  rows: AdminActivityRow[];
  loading?: boolean;
  label: string;
  seeAll: string;
  onOpen: (todoId: string) => void;
  showBoard?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  const columns = showBoard
    ? "minmax(7rem,1fr) minmax(7rem,1fr) minmax(10rem,2.2fr) minmax(7rem,1fr) 5.5rem"
    : "minmax(7rem,1fr) minmax(7rem,1fr) minmax(10rem,2.2fr) 5.5rem";

  return (
    <SummaryCard
      title={t("admin.recentActivity")}
      className={className}
      action={
        <Link
          to={seeAll}
          className="text-ink-3 hover:text-brand text-mini transition-colors"
        >
          {t("admin.seeAll")}
        </Link>
      }
    >
      <AdminGrid columns={columns} label={label} embedded narrow>
        <AdminRow header>
          <AdminCell header>{t("admin.columns.developer")}</AdminCell>
          <AdminCell header>{t("admin.columns.action")}</AdminCell>
          <AdminCell header>{t("admin.columns.item")}</AdminCell>
          {showBoard && <AdminCell header>{t("sidebar.board")}</AdminCell>}
          <AdminCell header align="right">
            {t("admin.columns.when")}
          </AdminCell>
        </AdminRow>

        {loading ? (
          Array.from({ length: 5 }, (_, index) => (
            <AdminRow key={index}>
              <span className="skeleton col-span-full h-3 rounded" />
            </AdminRow>
          ))
        ) : rows.length === 0 ? (
          <AdminEmpty>{t("admin.nothingHappened")}</AdminEmpty>
        ) : (
          rows.map((entry) => {
            const target = taskTarget(entry);
            const key = taskKey(entry.key_prefix, entry.board_key);

            return (
              <AdminRow
                key={entry.id}
                onOpen={target === null ? undefined : () => onOpen(target)}
              >
                <AdminCell>
                  <span className="text-ink">
                    {entry.actor_username ?? t("admin.unknown")}
                  </span>
                </AdminCell>

                <AdminCell>
                  <span className="text-ink-2">
                    {actionLabel(entry.action)}
                  </span>
                </AdminCell>

                <AdminCell>
                  {key && (
                    <span className="text-ink-3 text-mini mr-1.5 tabular-nums">
                      {key}
                    </span>
                  )}
                  <span className="text-ink-2">
                    {entry.title ?? t("common.untitled")}
                  </span>
                </AdminCell>

                {showBoard && (
                  <AdminCell>
                    <span className="text-ink-3">
                      {entry.board_title ?? "—"}
                    </span>
                  </AdminCell>
                )}

                <AdminCell align="right">
                  <span
                    className="text-ink-3 text-mini"
                    title={entry.created_at}
                  >
                    {relativeTime(entry.created_at)}
                  </span>
                </AdminCell>
              </AdminRow>
            );
          })
        )}
      </AdminGrid>
    </SummaryCard>
  );
}
