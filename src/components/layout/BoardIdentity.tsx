import MemberStack from "@/components/board/MemberStack";
import PresenceStack from "@/components/board/PresenceStack";
import { ICON_BUTTON } from "@/components/ui/controlChrome";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePanel } from "@/hooks/usePanel";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";
import { cn } from "@/utils/cn";

// SidebarTrigger is shadcn's Button, whose ghost/focus recipe these overrides replace with ICON_BUTTON.md's
const SIDEBAR_TRIGGER = cn(
  ICON_BUTTON.md,
  "-ml-2 focus-visible:border-transparent active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-wash-strong",
);

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
  const { data: spaces = [] } = useSpaces();
  const { openPanel } = usePanel();

  const space = spaces.find((it) => it.id === board.space_id);
  const narrowed = visibleCount !== todoCount;

  return (
    <header className="@container flex h-14 shrink-0 items-center gap-2 px-5 md:px-6">
      {/* the only way back to an offcanvas sidebar collapsed on this page, so it stays at every width */}
      <Tooltip>
        <TooltipTrigger
          render={<SidebarTrigger className={SIDEBAR_TRIGGER} />}
        />
        <TooltipContent side="bottom">Toggle sidebar</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="text-meta text-ink-3 hidden max-w-48 min-w-0 shrink-[2] items-baseline gap-2 @md:flex">
          <span className="truncate">{space ? space.title : "Unfiled"}</span>
          <span aria-hidden className="text-ink-3/60">
            /
          </span>
        </span>

        <h1 className="text-ink min-w-0 truncate text-lg font-semibold tracking-tight md:text-xl">
          {board.title || "Untitled board"}
        </h1>

        <p className="text-mini text-ink-3 ml-1 hidden shrink-0 items-baseline gap-1.5 whitespace-nowrap @3xl:flex">
          <span>
            {columnCount} {columnCount === 1 ? "column" : "columns"}
          </span>

          <span aria-hidden>·</span>

          {/* both numbers while filtered, so it doesn't quietly look like a small board */}
          <span className={cn(narrowed && "text-brand font-medium")}>
            {narrowed
              ? `${visibleCount} of ${todoCount} tasks`
              : `${todoCount} ${todoCount === 1 ? "task" : "tasks"}`}
          </span>

          {lastActivity && (
            <>
              <span aria-hidden>·</span>
              <span>Updated {lastActivity}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <PresenceStack viewers={viewers} className="hidden @md:flex" />
        <MemberStack onOpen={() => openPanel("members")} />
      </div>
    </header>
  );
}
