import Layout from "@/components/layout/Layout";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import NotFoundPage from "@/components/pages/error/NotFoundPage";
import Loading from "@/components/pages/loading/LoadingPage";
import { useBoard } from "@/services/boards/useBoard";
import { useBoardId } from "@/hooks/useBoardId";
import { isUuid } from "@/utils/uuid";

/**
 * One board, addressed by `/boards/:boardId`.
 *
 * Split in two so the hooks below run unconditionally. Validating the param
 * and then calling `useBoard` in the same component would mean an early return
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
      <div className="mx-auto mb-8 max-w-2xl">{board.title}</div>

      {/*
        KanbanBoard takes no boardId prop: the hooks beneath it read the route
        param themselves, so the board it renders and the board in the URL
        cannot disagree.
      */}
      <KanbanBoard />
    </Layout>
  );
}
