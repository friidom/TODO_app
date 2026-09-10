import { useState, type ReactNode } from "react";
import {
  ChevronRightIcon,
  ClockIcon,
  Columns3Icon,
  HistoryIcon,
  LayoutListIcon,
  type LucideIcon,
  MoreHorizontalIcon,
  UsersIcon,
} from "lucide-react";

import BoardFormModal from "@/components/boards/BoardFormModal";
import DeleteBoardModal from "@/components/boards/DeleteBoardModal";
import MemberStack from "@/components/board/MemberStack";
import PresenceStack from "@/components/board/PresenceStack";
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

export default function BoardIdentity({
  board,
  columnCount,
  todoCount,
  visibleCount,
  lastActivity,
  viewers = [],
}: {
  board: IBoard;
  columnCount: number;
  todoCount: number;
  visibleCount: number;
  viewers?: string[];
  // derived from the work items, not boards.updated_at — that column only moves on a rename/re-file
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
    <header className="border-hairline flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-5 pt-3 pb-4 md:flex-nowrap md:gap-y-0 md:px-6">
      <SidebarTrigger className="coarse:size-9 text-ink-3 hover:text-ink order-1 mt-0.5 shrink-0" />

      <div className="order-3 w-full min-w-0 md:order-2 md:w-auto md:flex-1">
        <p className="text-ink-3 flex min-w-0 items-center gap-1 text-xs">
          <span className="truncate">{space ? space.title : "Unfiled"}</span>
          <ChevronRightIcon className="size-3 shrink-0" />
          <span className="text-ink-2 truncate font-medium">
            {board.title || "Untitled board"}
          </span>
        </p>

        <h1 className="text-ink mt-0.5 truncate text-xl leading-tight font-bold tracking-[-0.02em] sm:text-2xl md:text-[28px]">
          {board.title || "Untitled board"}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip icon={Columns3Icon}>
            {columnCount} {columnCount === 1 ? "column" : "columns"}
          </Chip>

          {/* both numbers while filtered, so it doesn't quietly look like a small board */}
          <Chip icon={LayoutListIcon} tone={narrowed ? "brand" : "muted"}>
            {narrowed
              ? `${visibleCount} of ${todoCount} tasks`
              : `${todoCount} ${todoCount === 1 ? "task" : "tasks"}`}
          </Chip>

          {lastActivity && (
            <Chip icon={ClockIcon}>Last updated {lastActivity}</Chip>
          )}

          {memberCount > 0 && (
            <Chip icon={UsersIcon} className="max-md:hidden">
              Viewers: {memberCount}
            </Chip>
          )}
        </div>
      </div>

      <div className="order-2 ml-auto flex shrink-0 items-center gap-1 md:order-3 md:mt-0.5">
        <PresenceStack viewers={viewers} />

        <MemberStack onOpen={() => openPanel("members")} />

        <button
          type="button"
          onClick={() => openPanel("activity")}
          aria-label="Board activity"
          title="Board activity"
          className="text-ink-3 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control grid size-8 place-items-center transition-colors outline-none focus-visible:ring-2"
        >
          <HistoryIcon className="size-4" />
        </button>

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

function Chip({
  icon: Icon,
  tone = "muted",
  className,
  children,
}: {
  icon: LucideIcon;
  tone?: "muted" | "brand";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-control flex h-8 items-center gap-1.5 border px-2.5 text-xs whitespace-nowrap",
        tone === "brand"
          ? "border-brand/25 text-brand font-medium"
          : "border-ink/[0.07] text-ink-3",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
