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
import NotFoundPage from "@/pages/error/NotFoundPage";
import Loading from "@/components/loading/LoadingPage";
import { useBoard } from "@/services/boards/useBoard";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";
import { usePanel } from "@/hooks/usePanel";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { relativeTime } from "@/utils/relativeTime";
import { isUuid } from "@/utils/uuid";

/**
 * One board, addressed by `/boards/:boardId`.
 *
 * **The route stayed `/boards/:boardId` through M17**, deliberately: a board is
 * a uuid, moving it between spaces must not break a link somebody already has,
 * and `?view=`, `?task=` and `?panel=` all ride on this URL. Putting the space
 * in the path would make it part of the board's identity, which M15 decided it
 * is not.
 *
 * Split in two so the hooks below run unconditionally. Validating the param and
 * then calling `useBoard` in the same component would mean an early return
 * ahead of a hook, which changes the hook order between renders.
 */
export default function BoardPage() {
  const boardId = useBoardId();

  // Screened before it reaches the query. Postgres rejects a malformed uuid as
  // a type error rather than returning no rows, which would surface as a
  // thrown query and the generic error boundary — the wrong answer for a URL
  // that was simply typed wrong.
  if (!isUuid(boardId)) return <NotFoundPage />;

  return <BoardView boardId={boardId} />;
}

function BoardView({ boardId }: { boardId: string }) {
  const { data: board, isPending, error } = useBoard(boardId);

  // Above the early returns, like everything else here: which view is on screen
  // is read from the URL, so a link to a filtered list opens as one.
  const view = useBoardView();

  const { panel, closePanel } = usePanel();

  if (isPending) return <Loading />;

  // A genuine failure — offline, a policy error — is not a missing board.
  // Rethrowing hands it to the route's errorElement, which is what M1-08 put
  // there; telling the user the board does not exist would be a lie.
  if (error) throw error;

  // Null covers both "no such board" and "a board RLS will not show you", and
  // deliberately does not distinguish them. Answering 404 for someone else's
  // board rather than 403 means a stranger's id cannot be confirmed by
  // probing.
  if (!board) return <NotFoundPage />;

  return (
    <Layout>
      <ViewShell
        identity={<BoardMeta board={board} />}
        toolbar={<ViewToolbar view={view} />}
        // Board-level drawers only. The task detail used to win this slot and
        // reserve 22rem of every wide screen for a surface that is open a
        // fraction of the time; it is a modal now, so nothing but an open
        // board drawer ever takes width from the board.
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
        {/* No view takes a boardId prop: the hooks beneath them read the route
            param themselves, so the board they render and the board in the URL
            cannot disagree. They are three renderings of one query — the scope,
            the filter and the search are the same values for all of them. */}
        {view.mode === "summary" ? (
          <SummaryView />
        ) : view.mode === "list" ? (
          <ListView />
        ) : (
          <KanbanBoard />
        )}
      </ViewShell>

      {/* Outside the shell, and `fixed`, so it costs the board no layout at all
          — open or closed. It reads `?task=` itself and renders nothing when
          there is none. */}
      <TaskDetailModal boardId={boardId} />
    </Layout>
  );
}

/**
 * Split out so the identity row's counts do not add hooks to `BoardView`, which
 * has early returns above this point.
 *
 * Both hooks read cache entries the board already populates — TanStack Query
 * dedupes them against `KanbanBoard`'s own calls, so this is not a second round
 * trip.
 */
function BoardMeta({
  board,
}: {
  board: NonNullable<ReturnType<typeof useBoard>["data"]>;
}) {
  const { data: columns = [] } = useColumns();
  const { todos, all, total } = useVisibleTodos();

  /**
   * When the board was last worked on.
   *
   * **The newest `updated_at` among the cards, not `boards.updated_at`.** That
   * column moves when the board *row* changes — a rename, a re-filing — so a
   * board somebody uses daily would report the last time it was renamed. The
   * cards are already in memory, so this is a fold over an array and costs no
   * query.
   *
   * `created_at` is the fallback: a card that has never been edited has a null
   * `updated_at`, and a board of brand-new cards has activity all the same.
   */
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
    />
  );
}
