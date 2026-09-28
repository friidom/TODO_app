import { useState } from "react";
import { Link } from "react-router";
import {
  HistoryIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";

import DeleteBoardModal from "@/components/boards/DeleteBoardModal";
import IconButton from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBoardId } from "@/hooks/useBoardId";
import { usePanel } from "@/hooks/usePanel";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/services/auth/useAuth";
import { boardSettingsPath } from "@/services/boardSettings/registry";
import { useBoard } from "@/services/boards/useBoard";

// Activity is in the menu as well, because the icon gives way first on a narrow toolbar
export default function BoardActions() {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);
  const { user } = useAuth();
  const { panel, openPanel } = usePanel();

  // Settings is admin+, matching PATCH /boards/:boardId; deleting stays owner-only.
  const { canEditBoard } = usePermissions(boardId);
  const owned = !!board && board.owner_id === user?.id;

  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <IconButton
        label="Board activity"
        size="toolbar"
        active={panel === "activity"}
        onClick={() => openPanel("activity")}
        className="border-ink/15 hover:bg-wash-strong hidden size-8 rounded-md bg-transparent @lg:inline-grid"
      >
        <HistoryIcon />
      </IconButton>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              label="Board actions"
              size="toolbar"
              className="border-ink/15 hover:bg-wash-strong size-8 rounded-md bg-transparent"
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => openPanel("members")}>
            <UsersIcon />
            Members
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openPanel("activity")}>
            <HistoryIcon />
            Activity
          </DropdownMenuItem>

          {canEditBoard && boardId && (
            <DropdownMenuItem
              render={<Link to={boardSettingsPath(boardId, "details")} />}
            >
              <SettingsIcon />
              Board settings
            </DropdownMenuItem>
          )}

          {owned && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon />
                Delete board
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {deleting && board && (
        <DeleteBoardModal board={board} onClose={() => setDeleting(false)} />
      )}
    </>
  );
}
