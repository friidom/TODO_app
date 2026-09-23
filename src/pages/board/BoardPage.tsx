import { useMemo } from "react";

import BoardIdentity from "@/components/layout/BoardIdentity";
import Drawer from "@/components/layout/Drawer";
import Layout from "@/components/layout/Layout";
import ViewShell from "@/components/layout/ViewShell";
import ViewToolbar from "@/components/board/ViewToolbar";
import ActivityDrawer from "@/components/activity/ActivityDrawer";
import MembersDrawer from "@/components/members/MembersDrawer";
import TaskDetailModal from "@/components/todo/TaskDetailModal";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import ListView from "@/components/views/ListView";
import SummaryView from "@/components/summary/SummaryView";
import CalendarView from "@/components/calendar/CalendarView";
import TimelineView from "@/components/timeline/TimelineView";
import BacklogView from "@/components/backlog/BacklogView";
import NotFoundPage from "@/pages/error/NotFoundPage";
import Loading from "@/components/loading/LoadingPage";
import { useBoard } from "@/services/boards/useBoard";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { usePanel } from "@/hooks/usePanel";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useBoardRealtime } from "@/services/realtime/useBoardRealtime";
import { relativeTime } from "@/utils/relativeTime";
import { isUuid } from "@/utils/uuid";

// split in two so the hooks in BoardView run unconditionally — an early return before calling useBoard would break hook order
export default function BoardPage() {
  const boardId = useBoardId();

  // caught before it hits the query — a malformed uuid throws in Postgres and would surface as a generic error page
  if (!isUuid(boardId)) return <NotFoundPage />;

  return <BoardView boardId={boardId} />;
}

function BoardView({ boardId }: { boardId: string }) {
  const { data: board, isPending, error } = useBoard(boardId);

  const view = useBoardView();
  // A stale ?view=backlog must not outlive the feature being switched off.
  const sprintsEnabled = useSprintsEnabled();

  const { panel, closePanel } = usePanel();

  // one channel per board, opened here and torn down on unmount/boardId change — every view below just reads the cache it patches
  const viewers = useBoardRealtime(boardId);

  if (isPending) return <Loading />;

  // real failures (offline, RLS) go to the route's errorElement — telling the user "board not found" would be a lie
  if (error) throw error;

  // doesn't distinguish "no such board" from "not yours to see" — a stranger's id shouldn't be confirmable by probing
  if (!board) return <NotFoundPage />;

  return (
    <Layout>
      <ViewShell
        identity={<BoardMeta board={board} viewers={viewers} />}
        toolbar={<ViewToolbar view={view} />}
        drawer={
          panel === "members" ? (
            <Drawer title="Members" onClose={closePanel}>
              <MembersDrawer boardId={boardId} />
            </Drawer>
          ) : panel === "activity" ? (
            <Drawer title="Activity" onClose={closePanel}>
              <ActivityDrawer boardId={boardId} />
            </Drawer>
          ) : undefined
        }
      >
        {view.mode === "summary" ? (
          <SummaryView />
        ) : view.mode === "list" ? (
          <ListView />
        ) : view.mode === "calendar" ? (
          <CalendarView />
        ) : view.mode === "timeline" ? (
          <TimelineView />
        ) : view.mode === "backlog" && sprintsEnabled ? (
          <BacklogView />
        ) : (
          <KanbanBoard />
        )}
      </ViewShell>

      <TaskDetailModal boardId={boardId} />
    </Layout>
  );
}

// split out so BoardView, which has early returns above it, doesn't gain hooks
function BoardMeta({
  board,
  viewers,
}: {
  board: NonNullable<ReturnType<typeof useBoard>["data"]>;
  viewers: string[];
}) {
  const { data: columns = [] } = useColumns();
  const { todos, all, total } = useVisibleTodos();

  // newest card updated_at, not boards.updated_at — that column moves on a rename, not on real activity
  const lastActivity = useMemo(() => {
    const newest = all.reduce<number>((latest, todo) => {
      const stamp = Date.parse(todo.updated_at ?? todo.created_at);

      return Number.isNaN(stamp) ? latest : Math.max(latest, stamp);
    }, 0);

    return newest ? relativeTime(new Date(newest).toISOString()) : null;
  }, [all]);

  return (
    <BoardIdentity
      board={board}
      columnCount={columns.length}
      todoCount={total}
      visibleCount={todos.length}
      lastActivity={lastActivity}
      viewers={viewers}
    />
  );
}
