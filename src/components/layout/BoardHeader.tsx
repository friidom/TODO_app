import { useState } from "react";
import { KanbanIcon, MoreHorizontalIcon, UserPlusIcon } from "lucide-react";

import BoardFilters from "@/components/board/BoardFilters";
import BoardGroup from "@/components/board/BoardGroup";
import BoardSort from "@/components/board/BoardSort";
import ViewSwitch from "@/components/board/ViewSwitch";
import { HEADER_CONTROL } from "@/components/board/headerControl";
import InvitePeopleModal from "@/components/invites/InvitePeopleModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";

import HeaderTodoForm from "./header/HeaderTodoForm";

/**
 * The board's own header, between the global header and the Kanban.
 *
 * Filter, Group and Sort were visual placeholders until each got a backing
 * feature; they are live now and sit in the shell the placeholders defined
 * (`headerControl.ts`), so the header's proportions did not change when they
 * started working. The overflow `…` is still inert — it has no feature yet.
 *
 * `useBoardView` is read here rather than passed in: the view lives in the URL,
 * so every consumer subscribes to the same one source and there is no state to
 * thread down.
 *
 * The quick-add form is NOT a placeholder. It is the `HeaderTodoForm` that used
 * to live in the global header, moved here unchanged: it reads `useColumns()`
 * and appends to the leftmost column, both of which are board-scoped, so this is
 * where it belongs. In the global header it also rendered on `/profile`, where
 * it had no board to add to.
 */
export default function BoardHeader({
  title,
  columnCount,
  todoCount,
  visibleCount,
}: {
  title: string | null;
  columnCount: number;
  /** Every card on the board. */
  todoCount: number;
  /** How many of them survived the filter. */
  visibleCount: number;
}) {
  const view = useBoardView();

  // Owners and admins only. The rail carries the same control for anyone who
  // has the width for it; both are affordances, and `create_invite` is what
  // actually refuses an editor who reaches the RPC another way.
  const boardId = useBoardId();
  const { canManageMembers: canInvite } = usePermissions(boardId);
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = visibleCount !== todoCount;

  return (
    <div className="border-hairline flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="bg-brand-soft text-brand rounded-control grid size-9 shrink-0 place-items-center">
          <KanbanIcon className="size-[18px]" />
        </span>

        <div className="min-w-0">
          <h1 className="text-ink truncate text-lg font-semibold tracking-tight">
            {title || "Untitled board"}
          </h1>
          {/* Both numbers while filtered. "3 tasks" on a narrowed board is a
              lie of omission — someone who forgot a filter was on needs the
              header to say so. */}
          <p className="text-ink-3 truncate text-xs">
            {columnCount} {columnCount === 1 ? "column" : "columns"} ·{" "}
            {filtered ? (
              <span className="text-brand">
                {visibleCount} of {todoCount} tasks
              </span>
            ) : (
              <>
                {todoCount} {todoCount === 1 ? "task" : "tasks"}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <HeaderTodoForm />
        </div>

        <div className="flex items-center gap-1.5">
          <ViewSwitch view={view} />
          <BoardFilters view={view} />
          <BoardGroup view={view} />
          <BoardSort view={view} />

          {canInvite && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              title="Invite people"
              aria-label="Invite people"
              className={HEADER_CONTROL}
            >
              <UserPlusIcon className="size-4" />
            </button>
          )}

          <button
            type="button"
            disabled
            title="More — not built yet"
            aria-label="More — not built yet"
            className={HEADER_CONTROL}
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </div>
      </div>

      <InvitePeopleModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
