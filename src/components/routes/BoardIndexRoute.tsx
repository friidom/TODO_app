import { useState } from "react";
import { Navigate } from "react-router";
import Loading from "../loading/LoadingPage";
import BoardFormModal from "@/components/boards/BoardFormModal";
import { useBoards } from "@/services/boards/useBoards";

/**
 * What `/` means now: send the user to a board rather than rendering one.
 *
 * `getBoards` orders by `created_at`, so the first entry is the oldest board —
 * for an account migrated by M2-06 or seeded by M2-12, that is their personal
 * board.
 *
 * `replace` matters. Without it the redirect becomes a history entry, and Back
 * from the board lands on `/`, which redirects forward again — the button
 * stops working.
 */
export default function BoardIndexRoute() {
  const { data: boards, isPending, error } = useBoards();

  if (isPending) return <Loading />;

  // Same reasoning as BoardPage: a failed load is not an empty account.
  if (error) throw error;

  const firstBoard = boards?.[0];

  if (!firstBoard) return <NoBoards />;

  return <Navigate to={`/boards/${firstBoard.id}`} replace />;
}

/**
 * Reachable only by an account with no board at all. After M2-12 seeds one at
 * signup, and once M2-06 has run, this should be unreachable — but "should be"
 * is not a reason to render a blank page, and during the migration window it
 * is exactly what a half-migrated account would hit.
 *
 * **It is also reachable deliberately now:** M15 lets the last board be
 * deleted, and `DeleteBoardModal` sends you here when the board you deleted was
 * the one on screen. So the dead end got the create button this comment used to
 * say did not exist yet.
 */
function NoBoards() {
  const [creating, setCreating] = useState(false);

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-bold">No boards yet</p>

      <p className="text-muted-foreground">
        Create one to get started — it arrives with the four default columns.
      </p>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="bg-brand hover:bg-brand/90 text-brand-fg rounded-xl px-4 py-2"
      >
        Create board
      </button>

      {creating && <BoardFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
