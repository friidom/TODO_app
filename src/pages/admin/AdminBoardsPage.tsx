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
  const { period } = useAdminPeriod();
  const navigate = useNavigate();
  const { data, isFetching, error } = useAdminBoards(period);

  const boards = data?.boards ?? [];

  return (
    <AdminShell
      title="Boards"
      hint={
        data
          ? `${boards.length} boards · ${rangeLabel(data.from, data.to)}`
          : "Every board"
      }
      busy={isFetching}
    >
      {error ? (
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : (
        <AdminGrid columns={COLUMNS} label="Boards and their aggregates">
          <AdminRow header>
            <AdminCell header>Board</AdminCell>
            <AdminCell header>Owner</AdminCell>
            <AdminCell header align="right">
              Members
            </AdminCell>
            <AdminCell header align="right">
              Open
            </AdminCell>
            <AdminCell header align="right">
              Done
            </AdminCell>
            <AdminCell header align="right">
              Points
            </AdminCell>
            <AdminCell header align="right">
              Comments
            </AdminCell>
            <AdminCell header align="right">
              Last seen
            </AdminCell>
          </AdminRow>

          {boards.length === 0 ? (
            <AdminEmpty>No boards yet.</AdminEmpty>
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
                    {board.title ?? "Untitled board"}
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
                      title={`${board.unestimated_completed} completed with no estimate`}
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
