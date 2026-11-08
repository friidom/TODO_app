import { useTranslation } from "react-i18next";

import MemberStack from "@/components/board/MemberStack";
import PresenceStack from "@/components/board/PresenceStack";
import StarButton from "@/components/stars/StarButton";
import { ICON_BUTTON } from "@/components/ui/controlChrome";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePanel } from "@/hooks/usePanel";
import { spaceNameOf } from "@/services/spaces/boardSpace";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";
import { cn } from "@/utils/cn";

// SidebarTrigger is shadcn's Button, whose ghost/focus recipe these overrides replace with ICON_BUTTON.md's
const SIDEBAR_TRIGGER = cn(
  ICON_BUTTON.md,
  "-ml-2 md:hidden focus-visible:border-transparent active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-wash-strong",
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
  const { t } = useTranslation();
  const { data: spaces = [] } = useSpaces();
  const { openPanel } = usePanel();

  const spaceName = spaceNameOf(board, spaces);
  const narrowed = visibleCount !== todoCount;

  return (
    <header className="@container flex h-14 shrink-0 items-center gap-2 px-5 md:px-6">
      <Tooltip>
        <TooltipTrigger
          render={<SidebarTrigger className={SIDEBAR_TRIGGER} />}
        />
        <TooltipContent side="bottom">{t("sidebar.toggle")}</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        {spaceName !== null && (
          <span className="text-meta text-ink-3 hidden max-w-48 min-w-0 shrink-[2] items-baseline gap-2 @md:flex">
            <span className="truncate">{spaceName}</span>
            <span aria-hidden className="text-ink-3/60">
              /
            </span>
          </span>
        )}

        <h1 className="text-ink min-w-0 truncate text-lg font-semibold tracking-tight md:text-xl">
          {board.title || t("common.untitledBoard")}
        </h1>

        <StarButton boardId={board.id} className="shrink-0 self-center" />

        <p className="text-mini text-ink-3 ml-1 hidden shrink-0 items-baseline gap-1.5 whitespace-nowrap @3xl:flex">
          <span>{t("board.columnCount", { count: columnCount })}</span>

          <span aria-hidden>·</span>

          {/* both numbers while filtered, so it doesn't quietly look like a small board */}
          <span className={cn(narrowed && "text-brand font-medium")}>
            {narrowed
              ? t("board.visibleOfTasks", {
                  visible: visibleCount,
                  count: todoCount,
                })
              : t("board.taskCount", { count: todoCount })}
          </span>

          {lastActivity && (
            <>
              <span aria-hidden>·</span>
              <span>{t("board.updated", { when: lastActivity })}</span>
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
