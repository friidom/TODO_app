import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "react-router";
import {
  Columns3Icon,
  HistoryIcon,
  MoreHorizontalIcon,
  NetworkIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
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
import { cn } from "@/utils/cn";

// Activity and View settings are in the menu as well, because their icons give way first on a narrow toolbar
export default function BoardActions({
  showViewSettings = false,
}: {
  showViewSettings?: boolean;
}) {
  const boardId = useBoardId();
  const { t } = useTranslation();
  const { data: board } = useBoard(boardId);
  const { user } = useAuth();
  const { panel, openPanel, closePanel } = usePanel();

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
        onClick={() =>
          panel === "activity" ? closePanel() : openPanel("activity")
        }
        // same as View settings below: the idle background only applies when idle, or it cancels the active look
        className={cn(
          "hidden size-8 rounded-md @lg:inline-grid",
          panel !== "activity" &&
            "border-ink/15 hover:bg-wash-strong bg-transparent",
        )}
      >
        <HistoryIcon />
      </IconButton>

      {showViewSettings && (
        <IconButton
          label={t("viewSettings.title")}
          size="toolbar"
          active={panel === "settings"}
          onClick={() =>
            panel === "settings" ? closePanel() : openPanel("settings")
          }
          // bg-transparent and the idle border would cancel the active look, so they only apply when idle
          className={cn(
            "hidden size-8 rounded-md @lg:inline-grid",
            panel !== "settings" &&
              "border-ink/15 hover:bg-wash-strong bg-transparent",
          )}
        >
          <SlidersHorizontalIcon />
        </IconButton>
      )}

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

          {showViewSettings && (
            <DropdownMenuItem onClick={() => openPanel("settings")}>
              <SlidersHorizontalIcon />
              {t("viewSettings.title")}
            </DropdownMenuItem>
          )}

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
