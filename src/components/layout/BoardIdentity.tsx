import { useState, type ReactNode } from "react";
import {
  ChevronRightIcon,
  ClockIcon,
  Columns3Icon,
  LayoutListIcon,
  type LucideIcon,
  MoreHorizontalIcon,
  UsersIcon,
} from "lucide-react";

import BoardFormModal from "@/components/boards/BoardFormModal";
import DeleteBoardModal from "@/components/boards/DeleteBoardModal";
import MemberStack from "@/components/board/MemberStack";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import { useBoardId } from "@/hooks/useBoardId";
import { usePanel } from "@/hooks/usePanel";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";
import { cn } from "@/utils/cn";

/**
 * Which board this is, and what can be done to it (M17).
 *
 * **The breadcrumb merged into the title block rather than getting a bar of its
 * own.** Three stacked bars is the reference's composition and it costs ~56px
 * of vertical space on every screen to render one line of text; folding the
 * trail above the title says the same thing in the space the title already
 * occupies.
 *
 * The trail reads the caller's own spaces (M15), so a board filed in *someone
 * else's* space shows "Unfiled" — not a bug, and not a leak either: spaces are
 * owner-only by RLS, so the row genuinely is not the caller's to see. That is
 * the same rule `groupBoardsBySpace` applies in the sidebar, and both come out
 * of the M15 decision that a space is filing rather than a permission scope.
 *
 * The `⋯` menu replaces the inert one the old board header carried. It reuses
 * M15's modals and M15's ownership gate — settings and deletion are owner-only
 * in the database (the `boards_space_ownership` trigger and M2-01's DELETE
 * policy), and `board.owner_id` is on the row already, so the check costs
 * nothing. An admin may rename through the database; a board-level surface for
 * that is not this milestone's.
 */
export default function BoardIdentity({
  board,
  columnCount,
  todoCount,
  visibleCount,
  lastActivity,
}: {
  board: IBoard;
  columnCount: number;
  /** Every card on the board. */
  todoCount: number;
  /** How many of them survived the filter and the search. */
  visibleCount: number;
  /**
   * When the board was last worked on, already formatted — "2m ago".
   *
   * **Derived from the work items, not from `boards.updated_at`.** That column
   * moves when the board *row* changes — a rename, a re-filing — so it would
   * read "3 months ago" on a board someone is using every day. `BoardPage`
   * takes the newest `updated_at` among the cards it already holds, which
   * costs no query.
   */
  lastActivity: string | null;
}) {
  const { user } = useAuth();
  const { data: spaces = [] } = useSpaces();
  const { openPanel } = usePanel();
  const boardId = useBoardId();
  const { data: members = [] } = useBoardMembers(boardId);
  const memberCount = members.length;

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const space = spaces.find((it) => it.id === board.space_id);
  const owned = board.owner_id === user?.id;
  const narrowed = visibleCount !== todoCount;

  return (
    <header className="border-hairline flex items-start gap-3 border-b px-5 pt-3 pb-4 md:px-6">
      {/* The sidebar's only trigger, and it has to be out here: the sidebar is
          `collapsible="offcanvas"`, so a collapsed one has no width and a
          trigger inside it would vanish with it. */}
      <SidebarTrigger className="text-ink-3 hover:text-ink mt-0.5 shrink-0" />

      <div className="min-w-0 flex-1">
        {/* The trail. Not a link yet — a space has no page of its own, and a
            crumb that navigates nowhere is worse than one that simply orients. */}
        <p className="text-ink-3 flex min-w-0 items-center gap-1 text-xs">
          <span className="truncate">{space ? space.title : "Unfiled"}</span>
          <ChevronRightIcon className="size-3 shrink-0" />
          <span className="text-ink-2 truncate font-medium">
            {board.title || "Untitled board"}
          </span>
        </p>

        <h1 className="text-ink mt-0.5 truncate text-[28px] leading-tight font-bold tracking-[-0.02em]">
          {board.title || "Untitled board"}
        </h1>

        {/* The metadata, as chips rather than a sentence. Four small bordered
            objects give the header the weight the mockup has, and each one is a
            separate fact — a comma-spliced line reads as one. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip icon={Columns3Icon}>
            {columnCount} {columnCount === 1 ? "column" : "columns"}
          </Chip>

          {/* Both numbers while narrowed. "3 tasks" on a filtered board is a
              lie of omission — someone who forgot a filter was on needs the
              header to say so. */}
          <Chip icon={LayoutListIcon} tone={narrowed ? "brand" : "muted"}>
            {narrowed
              ? `${visibleCount} of ${todoCount} tasks`
              : `${todoCount} ${todoCount === 1 ? "task" : "tasks"}`}
          </Chip>

          {lastActivity && (
            <Chip icon={ClockIcon}>Last updated {lastActivity}</Chip>
          )}

          {memberCount > 0 && (
            <Chip icon={UsersIcon}>Viewers: {memberCount}</Chip>
          )}
        </div>
      </div>

      {/* Level with the breadcrumb rather than centred against the whole block:
          the title and its metadata own the left column, and the actions read
          as page chrome rather than as part of the heading. */}
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        <MemberStack onOpen={() => openPanel("members")} />

        {owned && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Board actions"
              className="text-ink-3 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control grid size-8 place-items-center transition-colors outline-none focus-visible:ring-2"
            >
              <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                Board settings
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => setDeleting(true)}
                className="text-status-red"
              >
                Delete board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {editing && (
        <BoardFormModal board={board} onClose={() => setEditing(false)} />
      )}

      {deleting && (
        <DeleteBoardModal board={board} onClose={() => setDeleting(false)} />
      )}
    </header>
  );
}

/** One metadata fact. Bordered rather than filled, so four in a row stay quiet. */
function Chip({
  icon: Icon,
  tone = "muted",
  children,
}: {
  icon: LucideIcon;
  tone?: "muted" | "brand";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        // A rounded rectangle rather than a pill, and at 12px rather than 11:
        // four full-round pills in a row read as badges floating over the
        // header, where four soft rectangles read as one metadata strip.
        "rounded-control flex h-8 items-center gap-1.5 border px-2.5 text-xs whitespace-nowrap",
        tone === "brand"
          ? "border-brand/25 text-brand font-medium"
          : "border-ink/[0.07] text-ink-3",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
