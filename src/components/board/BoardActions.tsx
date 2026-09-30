import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "react-router";
import {
  Columns3Icon,
  HistoryIcon,
  MoreHorizontalIcon,
  NetworkIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";

import DeleteBoardModal from "@/components/boards/DeleteBoardModal";
import IconButton from "@/components/ui/IconButton";
import ConfigureColumnsModal from "@/components/workflow/ConfigureColumnsModal";
import ManageWorkflowsModal from "@/components/workflow/ManageWorkflowsModal";
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
  const { t } = useTranslation();
  const { data: board } = useBoard(boardId);
  const { user } = useAuth();
  const { panel, openPanel } = usePanel();

  // Settings is admin+, matching PATCH /boards/:boardId; deleting stays owner-only.
  const { canEditBoard, canManageWorkflow } = usePermissions(boardId);
  const owned = !!board && board.owner_id === user?.id;

  const [deleting, setDeleting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [managing, setManaging] = useState(false);

  return (
    <>
      <IconButton
        label={t("board.activityButton")}
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
              label={t("board.actions")}
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
            {t("board.members")}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openPanel("activity")}>
            <HistoryIcon />
            {t("board.activity")}
          </DropdownMenuItem>

          {canEditBoard && boardId && (
            <DropdownMenuItem
              render={<Link to={boardSettingsPath(boardId, "details")} />}
            >
              <SettingsIcon />
              {t("sidebar.boardSettings")}
            </DropdownMenuItem>
          )}

          {canManageWorkflow && (
            <DropdownMenuItem onClick={() => setConfiguring(true)}>
              <Columns3Icon />
              {t("board.configureColumns")}
            </DropdownMenuItem>
          )}

          {canManageWorkflow && (
            <DropdownMenuItem onClick={() => setManaging(true)}>
              <NetworkIcon />
              {t("board.manageWorkflows")}
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
                {t("sidebar.deleteBoard")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {configuring && (
        <ConfigureColumnsModal onClose={() => setConfiguring(false)} />
      )}

      {managing && <ManageWorkflowsModal onClose={() => setManaging(false)} />}

      {deleting && board && (
        <DeleteBoardModal board={board} onClose={() => setDeleting(false)} />
      )}
    </>
  );
}
