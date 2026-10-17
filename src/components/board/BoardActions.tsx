import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { Link } from "react-router";
import {
  Columns3Icon,
  HistoryIcon,
  MoreHorizontalIcon,
  NetworkIcon,
  PencilIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";

import CreateSprintModal from "@/components/backlog/CreateSprintModal";
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
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { useAuth } from "@/services/auth/useAuth";
import { boardSettingsPath } from "@/services/boardSettings/registry";
import { useBoard } from "@/services/boards/useBoard";
import { editableSprint } from "@/services/sprints/activeSprint";
import { useSprints } from "@/services/sprints/useSprints";
import { useIsStarred, useToggleStar } from "@/services/stars/useStars";
import { useBoardViewPrefs } from "@/hooks/useBoardViewPrefs";
import { cn } from "@/utils/cn";

// View settings is in the menu as well, because its icon gives way first on a narrow toolbar
export default function BoardActions({
  showViewSettings = false,
}: {
  showViewSettings?: boolean;
}) {
  const boardId = useBoardId();
  const { t } = useTranslation();
  const { dirty: viewDirty } = useBoardViewPrefs();
  const { data: board } = useBoard(boardId);
  const { user } = useAuth();
  const { panel, openPanel, closePanel } = usePanel();

  // Settings is admin+, matching PATCH /boards/:boardId; deleting stays owner-only.
  const { canEditBoard, canEditTodos, canManageWorkflow } =
    usePermissions(boardId);
  const owned = !!board && board.owner_id === user?.id;

  const { data: sprints = [] } = useSprints();
  const sprint = editableSprint(sprints, useSprintsEnabled(), canEditTodos);

  const starred = useIsStarred(boardId);
  const toggleStar = useToggleStar(boardId ?? "");

  // The toolbar's Activity icon hides on a narrow container; the menu offers
  // Activity only then. The menu is portalled, so a container query cannot reach it.
  const activityIcon = useRef<HTMLButtonElement>(null);
  const [activityInMenu, setActivityInMenu] = useState(true);
  const [editingSprint, setEditingSprint] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [managing, setManaging] = useState(false);

  return (
    <>
      <IconButton
        ref={activityIcon}
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
          label={
            viewDirty
              ? `${t("viewSettings.title")} — ${t("viewSettings.unsaved")}`
              : t("viewSettings.title")
          }
          size="toolbar"
          active={panel === "settings"}
          onClick={() =>
            panel === "settings" ? closePanel() : openPanel("settings")
          }
          // bg-transparent and the idle border would cancel the active look, so they only apply when idle
          className={cn(
            "relative hidden size-8 rounded-md @lg:inline-grid",
            panel !== "settings" &&
              "border-ink/15 hover:bg-wash-strong bg-transparent",
          )}
        >
          <SlidersHorizontalIcon />

          {viewDirty && (
            <span
              aria-hidden
              className="bg-brand ring-surface absolute top-1 right-1 size-2 rounded-full ring-2"
            />
          )}
        </IconButton>
      )}

      <DropdownMenu
        onOpenChange={(open) => {
          if (open) setActivityInMenu(!activityIcon.current?.offsetParent);
        }}
      >
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

        <DropdownMenuContent align="end" className="w-52">
          {boardId && (
            <DropdownMenuItem onClick={() => toggleStar.mutate(!starred)}>
              <StarIcon
                className={cn(
                  starred && "fill-status-orange text-status-orange",
                )}
              />
              {t(starred ? "starred.unstar" : "starred.star")}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => openPanel("members")}>
            <UsersIcon />
            {t("board.members")}
          </DropdownMenuItem>

          {activityInMenu && (
            <DropdownMenuItem onClick={() => openPanel("activity")}>
              <HistoryIcon />
              {t("board.activity")}
            </DropdownMenuItem>
          )}

          {sprint && (
            <DropdownMenuItem onClick={() => setEditingSprint(true)}>
              <PencilIcon />
              {t("backlog.editSprint")}
            </DropdownMenuItem>
          )}

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

      {editingSprint && sprint && (
        <CreateSprintModal
          sprint={sprint}
          onClose={() => setEditingSprint(false)}
        />
      )}

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
