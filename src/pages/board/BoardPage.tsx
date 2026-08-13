import Layout from "@/components/layout/Layout";
import BoardHeader from "@/components/layout/BoardHeader";
import ContextRail from "@/components/layout/ContextRail";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import ListView from "@/components/views/ListView";
import NotFoundPage from "@/pages/error/NotFoundPage";
import Loading from "@/components/loading/LoadingPage";
import { useBoard } from "@/services/boards/useBoard";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
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

  // Above the early returns, like everything else here: which view is on screen
  // is read from the URL, so a link to a filtered list opens as one.
  const { mode } = useBoardView();

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
    <Layout rail={<ContextRail boardId={boardId} />}>
      <BoardMeta title={board.title} />

      {/*
        The board's scroll container. KanbanBoard's own root is
        `h-full overflow-x-auto`, so it needs an ancestor with a bounded height
        to scroll inside — `min-h-0` is what bounds it, since a flex child
        otherwise refuses to shrink below its content.
      */}
      <div className="min-h-0 flex-1 px-4 pt-4 md:px-6">
        {/*
          Neither view takes a boardId prop: the hooks beneath them read the
          route param themselves, so the board they render and the board in the
          URL cannot disagree. They are two layouts over one query — the filter,
          the sort and the grouping are the same values for both.
        */}
        {mode === "list" ? <ListView /> : <KanbanBoard />}
      </div>
    </Layout>
  );
}

/**
 * Split out so the board header's counts do not add hooks to `BoardView`, which
 * has early returns above this point.
 *
 * Both hooks read cache entries the board already populates — TanStack Query
 * dedupes them against `KanbanBoard`'s own calls, so this is not a second round
 * trip.
 */
function BoardMeta({ title }: { title: string | null }) {
  const { data: columns = [] } = useColumns();
  const { todos, total } = useVisibleTodos();

  return (
    <BoardHeader
      title={title}
      columnCount={columns.length}
      todoCount={total}
      visibleCount={todos.length}
    />
  );
}
