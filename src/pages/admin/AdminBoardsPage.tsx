import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminNumber,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminBoards } from "@/services/admin/useAdmin";
import { rangeLabel } from "@/services/admin/format";
import { relativeTime } from "@/utils/relativeTime";

const COLUMNS =
  "minmax(12rem,2fr) minmax(8rem,1fr) repeat(5, minmax(5rem,0.8fr)) 7rem";

export default function AdminBoardsPage() {
  const { t } = useTranslation();
  const { period } = useAdminPeriod();
  const navigate = useNavigate();
  const { data, error } = useAdminBoards(period);

  const boards = data?.boards ?? [];

  return (
    <AdminPage
      title={t("boards.title")}
      description={
        data
          ? t("admin.boards.hint", {
              count: boards.length,
              range: rangeLabel(data.from, data.to),
            })
          : t("admin.allBoards")
      }
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
                  <span
                    className="text-ink block truncate font-medium"
                    title={board.title ?? undefined}
                  >
                    {board.title ?? t("common.untitledBoard")}
                  </span>
                  <span className="text-ink-3 text-mini block truncate">
                    {board.space_title ?? t("common.unfiled")}
                  </span>
                </AdminCell>

                <AdminCell>
                  <span className="text-ink-2">
                    {board.owner_username ?? "—"}
                  </span>
                </AdminCell>

                <AdminCell align="right">
                  <AdminNumber value={board.members} />
                </AdminCell>
                <AdminCell align="right">
                  <AdminNumber value={board.open_todos} />
                </AdminCell>
                <AdminCell align="right">
                  <AdminNumber value={board.completed_todos} />
                </AdminCell>

                <AdminCell align="right">
                  <span className="block">
                    <AdminNumber value={board.completed_points} />
                  </span>
                  {board.unestimated_completed > 0 && (
                    <span
                      className="text-ink-3 text-mini block"
                      title={t("admin.unestimatedCompleted", {
                        count: board.unestimated_completed,
                      })}
                    >
                      {t("admin.unestimatedCount", {
                        count: board.unestimated_completed,
                      })}
                    </span>
                  )}
                </AdminCell>

                <AdminCell align="right">
                  <AdminNumber value={board.comments} />
                </AdminCell>

                <AdminCell align="right">
                  <span className="text-ink-3 text-mini">
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
    </AdminPage>
  );
}
