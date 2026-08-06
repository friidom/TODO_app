import { Navigate } from "react-router";
import Loading from "../loading/LoadingPage";
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
 * No create button: board creation is UI, and this milestone has none yet.
 */
function NoBoards() {
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-bold">No boards yet</p>

      <p className="text-muted-foreground">
        This account does not have a board. If you expected one, it may not have
        finished being set up.
      </p>
    </div>
  );
}
