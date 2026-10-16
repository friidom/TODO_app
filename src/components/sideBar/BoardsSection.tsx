import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  KanbanIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";

import BoardFormModal from "@/components/boards/BoardFormModal";
import DeleteBoardModal from "@/components/boards/DeleteBoardModal";
import DropLine from "@/components/dnd/DropLine";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import DeleteSpaceModal from "@/components/spaces/DeleteSpaceModal";
import SpaceFormModal from "@/components/spaces/SpaceFormModal";
import IconButton from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuActions,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/services/auth/useAuth";
import { boardSettingsPath } from "@/services/boardSettings/registry";
import {
  SIDEBAR_DND,
  UNFILED,
  spaceKeyOf,
  type SidebarList,
} from "@/services/sidebar/layout";
import type { SpaceGroup } from "@/services/spaces/groupBoards";
import type { IBoard, ISpace } from "@/types/data";
import { cn } from "@/utils/cn";
import Section, { Collapse, Grip } from "./Section";
import { stepKey } from "./stepKey";

// gated on board.owner_id, not a roster fetch — filing/deleting is owner-only in the db anyway, and the row already has this field
type Dialog =
  | { kind: "create-board"; spaceId: string | null }
  | { kind: "delete-board"; board: IBoard }
  | { kind: "create-space" }
  | { kind: "rename-space"; space: ISpace }
  | { kind: "delete-space"; space: ISpace; boardCount: number }
  | null;

type Step = (
  list: SidebarList,
  id: string,
  delta: -1 | 1,
  container?: string,
) => void;

export default function BoardsSection({
  groups,
  loading,
  open,
  collapsed,
  onToggle,
  onStep,
}: {
  groups: SpaceGroup[];
  loading: boolean;
  open: boolean;
  collapsed: string[];
  onToggle: (key: string) => void;
  onStep: Step;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  return (
    <>
      <Section
        id="spaces"
        label={t("sidebar.spaces")}
        open={open}
        onToggle={() => onToggle("spaces")}
        onStep={(delta) => onStep("section", "spaces", delta)}
        actions={<CreateMenu onDialog={setDialog} />}
      >
        <SidebarMenu>
          {loading &&
            [0, 1, 2].map((row) => (
              <SidebarMenuItem key={row}>
                <div className="flex h-8 items-center gap-2 px-2">
                  <Skeleton className="size-4 rounded" />
                  <Skeleton
                    className="h-3 rounded-full"
                    style={{ width: `${55 - row * 12}%` }}
                  />
                </div>
              </SidebarMenuItem>
            ))}

          {!loading && groups.length === 0 && (
            <SidebarMenuItem>
              <button
                type="button"
                onClick={() =>
                  setDialog({ kind: "create-board", spaceId: null })
                }
                className="text-ink-3 hover:text-ink text-meta flex h-8 items-center gap-2 px-2 transition-colors"
              >
                <PlusIcon className="size-4" />
                {t("sidebar.newBoard")}
              </button>
            </SidebarMenuItem>
          )}

          {groups.map((group) => {
            const key = spaceKeyOf(group);

            return (
              <SpaceRow
                key={key}
                group={group}
                userId={user?.id}
                collapsed={collapsed.includes(key)}
                onToggle={() => onToggle(key)}
                onStep={onStep}
                onDialog={setDialog}
              />
            );
          })}
        </SidebarMenu>
      </Section>

      {dialog?.kind === "create-board" && (
        <BoardFormModal spaceId={dialog.spaceId} onClose={close} />
      )}

      {dialog?.kind === "delete-board" && (
        <DeleteBoardModal board={dialog.board} onClose={close} />
      )}

      {dialog?.kind === "create-space" && <SpaceFormModal onClose={close} />}

      {dialog?.kind === "rename-space" && (
        <SpaceFormModal space={dialog.space} onClose={close} />
      )}

      {dialog?.kind === "delete-space" && (
        <DeleteSpaceModal
          space={dialog.space}
          boardCount={dialog.boardCount}
          onClose={close}
        />
      )}
    </>
  );
}

function CreateMenu({ onDialog }: { onDialog: (dialog: Dialog) => void }) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<IconButton size="xs" label={t("sidebar.createIn")} />}
      >
        <PlusIcon />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem
          onClick={() => onDialog({ kind: "create-board", spaceId: null })}
        >
          <KanbanIcon />
          {t("sidebar.newBoard")}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onDialog({ kind: "create-space" })}>
          <FolderPlusIcon />
          {t("sidebar.createSpace")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link to="/boards" />}>
          <Settings2Icon />
          {t("sidebar.manageBoards")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// space === null is the "can't file this" group — a board shared with you whose owner's space you can't read via RLS
function SpaceRow({
  group,
  userId,
  collapsed,
  onToggle,
  onStep,
  onDialog,
}: {
  group: SpaceGroup;
  userId: string | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onStep: Step;
  onDialog: (dialog: Dialog) => void;
}) {
  const { t } = useTranslation();
  const { space, boards } = group;
  const key = spaceKeyOf(group);

  // Unfiled is pinned last: it is not a space of the reader's to arrange
  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(key, {
    group: SIDEBAR_DND.space,
    axis: "y",
    disabled: key === UNFILED,
  });

  const title = space?.title ?? t("common.unfiled");
  const newBoardLabel = space
    ? t("sidebar.newBoardIn", { space: space.title })
    : t("sidebar.newBoardUnfiled");

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "relative mt-1.5 transition-opacity first:mt-0",
        isDragging && "opacity-40",
      )}
    >
      <div data-sidebar="menu-item" className="group/menu-item relative">
        {space && <Grip {...pointerProps} className="-left-2" />}

        <SidebarMenuButton
          onClick={onToggle}
          onKeyDown={
            space ? stepKey((delta) => onStep("space", key, delta)) : undefined
          }
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "sidebar.expand" : "sidebar.collapse", {
            name: title,
          })}
          title={title}
          className={cn(
            "font-semibold",
            space ? "coarse:pr-18 pr-14" : "coarse:pr-10 pr-8",
          )}
        >
          {space ? (
            <span className="bg-brand-soft text-brand text-micro grid size-4 shrink-0 place-items-center rounded font-bold">
              {space.title.trim().charAt(0).toUpperCase()}
            </span>
          ) : (
            <FolderIcon className="text-ink-3" />
          )}

          <span className="min-w-0 truncate">{title}</span>

          <ChevronRightIcon
            className={cn(
              "text-ink-3 coarse:opacity-100 size-3.5 opacity-0 transition-[opacity,rotate] duration-150 group-hover/menu-item:opacity-100 group-focus-visible/menu-button:opacity-100",
              collapsed ? "opacity-100" : "rotate-90",
            )}
          />
        </SidebarMenuButton>

        <SidebarMenuActions>
          <IconButton
            size="xs"
            label={newBoardLabel}
            onClick={() =>
              onDialog({ kind: "create-board", spaceId: space?.id ?? null })
            }
          >
            <PlusIcon />
          </IconButton>

          {space && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <IconButton
                    size="xs"
                    label={t("common.optionsFor", { name: space.title })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem
                  render={<Link to={`/spaces/${space.id}/settings`} />}
                >
                  <SettingsIcon />
                  {t("sidebar.spaceSettings")}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => onDialog({ kind: "rename-space", space })}
                >
                  <PencilIcon />
                  {t("sidebar.renameSpace")}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    onDialog({
                      kind: "delete-space",
                      space,
                      boardCount: boards.length,
                    })
                  }
                >
                  <Trash2Icon />
                  {t("sidebar.deleteSpace")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SidebarMenuActions>
      </div>

      <Collapse open={!collapsed}>
        <SidebarMenu className="mt-0.5">
          {boards.length === 0 ? (
            <SidebarMenuItem>
              <span className="text-ink-3 text-meta flex h-8 items-center pl-8">
                {space ? t("sidebar.noBoards") : t("sidebar.nothingHere")}
              </span>
            </SidebarMenuItem>
          ) : (
            boards.map((board) => (
              <BoardRow
                key={board.id}
                board={board}
                container={key}
                owned={board.owner_id === userId}
                onStep={onStep}
                onDialog={onDialog}
              />
            ))
          )}
        </SidebarMenu>
      </Collapse>

      <DropLine edge={edge} axis="y" />
    </li>
  );
}

function BoardRow({
  board,
  container,
  owned,
  onStep,
  onDialog,
}: {
  board: IBoard;
  container: string;
  owned: boolean;
  onStep: Step;
  onDialog: (dialog: Dialog) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();

  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(
    board.id,
    { group: SIDEBAR_DND.board, axis: "y", container },
  );

  const to = `/boards/${board.id}`;
  // startsWith, not equality: /boards/:id/settings/... is still this board, and
  // an exact match would un-highlight the row the moment settings opened. The
  // `/` guard keeps a sibling id whose prefix matches from lighting up too.
  const isActive =
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  const title = board.title || t("common.untitledBoard");

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      className={cn("transition-opacity", isDragging && "opacity-40")}
    >
      <Grip {...pointerProps} className="left-3" />

      <SidebarMenuButton
        render={<NavLink to={to} draggable={false} />}
        isActive={isActive}
        title={title}
        onKeyDown={stepKey((delta) =>
          onStep("board", board.id, delta, container),
        )}
        className={cn("pl-8", owned && "coarse:pr-10 pr-8")}
      >
        <KanbanIcon />
        <span>{title}</span>
      </SidebarMenuButton>

      {owned && (
        <SidebarMenuActions>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <IconButton
                  size="xs"
                  label={t("common.optionsFor", {
                    name: board.title || t("sidebar.board"),
                  })}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem
                render={<Link to={boardSettingsPath(board.id, "details")} />}
              >
                <SettingsIcon />
                {t("sidebar.boardSettings")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDialog({ kind: "delete-board", board })}
              >
                <Trash2Icon />
                {t("sidebar.deleteBoard")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuActions>
      )}

      <DropLine edge={edge} axis="y" />
    </SidebarMenuItem>
  );
}
