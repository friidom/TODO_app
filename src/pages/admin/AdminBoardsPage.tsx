import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminBoards } from "@/services/admin/useAdmin";
import { dash, rangeLabel } from "@/services/admin/format";
import { relativeTime } from "@/utils/relativeTime";

const COLUMNS =
  "minmax(12rem,2fr) minmax(8rem,1fr) repeat(5, minmax(5rem,0.8fr)) 7rem";

export default function AdminBoardsPage() {
  const { t } = useTranslation();
  const { period } = useAdminPeriod();
  const navigate = useNavigate();
  const { data, isFetching, error } = useAdminBoards(period);

  const boards = data?.boards ?? [];

  return (
    <AdminShell
      title={t("boards.title")}
      hint={
        data
          ? t("admin.boards.hint", {
              count: boards.length,
              range: rangeLabel(data.from, data.to),
            })
          : t("admin.allBoards")
      }
      busy={isFetching}
    >
      {error ? (
        <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : (
        <AdminGrid columns={COLUMNS} label={t("admin.boards.gridLabel")}>
          <AdminRow header>
            <AdminCell header>{t("sidebar.board")}</AdminCell>
            <AdminCell header>{t("roles.owner")}</AdminCell>
            <AdminCell header align="right">
              {t("board.members")}
            </AdminCell>
            <AdminCell header align="right">
              {t("admin.columns.open")}
            </AdminCell>
            <AdminCell header align="right">
              {t("columnCategory.done")}
            </AdminCell>
            <AdminCell header align="right">
              {t("admin.columns.points")}
            </AdminCell>
            <AdminCell header align="right">
              {t("taskActivity.comments")}
            </AdminCell>
            <AdminCell header align="right">
              {t("admin.columns.lastSeen")}
            </AdminCell>
          </AdminRow>

          {boards.length === 0 ? (
            <AdminEmpty>{t("sidebar.noBoardsYet")}</AdminEmpty>
          ) : (
            boards.map((board) => (
              <AdminRow
                key={board.id}
                onOpen={() =>
                  void navigate(`/admin/boards/${board.id}?period=${period}`)
                }
              >
                <AdminCell>
                  <span className="text-ink font-medium">
                    {board.title ?? t("common.untitledBoard")}
                  </span>
                </AdminCell>

                <AdminCell>
                  <span className="text-ink-2">
                    {board.owner_username ?? "—"}
                  </span>
                </AdminCell>

                <AdminCell align="right">{board.members}</AdminCell>
                <AdminCell align="right">{board.open_todos}</AdminCell>
                <AdminCell align="right">{board.completed_todos}</AdminCell>

                <AdminCell align="right">
                  {dash(board.completed_points)}
                  {board.unestimated_completed > 0 && (
                    <span
                      className="text-ink-3 text-micro ml-1"
                      title={t("admin.unestimatedCompleted", {
                        count: board.unestimated_completed,
                      })}
                    >
                      +{board.unestimated_completed}?
                    </span>
                  )}
                </AdminCell>

                <AdminCell align="right">{board.comments}</AdminCell>

                <AdminCell align="right">
                  <span className="text-ink-3 text-micro">
                    {board.last_activity_at === null
                      ? "—"
                      : relativeTime(board.last_activity_at)}
                  </span>
                </AdminCell>
              </AdminRow>
            ))
          )}
        </AdminGrid>
      )}
    </AdminShell>
  );
}
