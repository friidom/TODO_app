import { useState } from "react";
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
  SidebarGroup,
  SidebarMenu,
  SidebarMenuActions,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import { groupBoardsBySpace } from "@/services/spaces/groupBoards";
import { useSpaces } from "@/services/spaces/useSpaces";
import { boardSettingsPath } from "@/services/boardSettings/registry";
import type { IBoard, ISpace } from "@/types/data";
import { cn } from "@/utils/cn";
import SectionLabel from "./SectionLabel";

// gated on board.owner_id, not a roster fetch — filing/deleting is owner-only in the db anyway, and the row already has this field
type Dialog =
  | { kind: "create-board"; spaceId: string | null }
  | { kind: "delete-board"; board: IBoard }
  | { kind: "create-space" }
  | { kind: "rename-space"; space: ISpace }
  | { kind: "delete-space"; space: ISpace; boardCount: number }
  | null;

export default function BoardsSection() {
  const { user } = useAuth();
  const { data: boards = [], isPending } = useBoards();
  const { data: spaces = [] } = useSpaces();

  const [dialog, setDialog] = useState<Dialog>(null);

  // client-only, never persisted — just how this person is looking at the tree right now
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const [sectionOpen, setSectionOpen] = useState(true);

  const groups = groupBoardsBySpace(boards, spaces);
  const close = () => setDialog(null);

  const toggle = (key: string) =>
    setCollapsed((open) =>
      open.includes(key) ? open.filter((it) => it !== key) : [...open, key],
    );

  return (
    <>
      <SidebarGroup>
        <SectionLabel
          label="Spaces"
          open={sectionOpen}
          onToggle={() => setSectionOpen((open) => !open)}
        />

        <SidebarMenu
          className={cn(
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
            !sectionOpen && "hidden",
          )}
        >
          {isPending && (
            <SidebarMenuItem>
              <span className="text-ink-3 text-meta flex h-8 items-center px-2">
                Loading…
              </span>
            </SidebarMenuItem>
          )}

          {!isPending && boards.length === 0 && spaces.length === 0 && (
            <SidebarMenuItem>
              <span className="text-ink-3 text-meta flex h-8 items-center px-2">
                No boards yet
              </span>
            </SidebarMenuItem>
          )}

          {groups.map((group) => {
            const key = group.space?.id ?? "unfiled";

            return (
              <SpaceRow
                key={key}
                space={group.space}
                boards={group.boards}
                userId={user?.id}
                collapsed={collapsed.includes(key)}
                onToggle={() => toggle(key)}
                onDialog={setDialog}
              />
            );
          })}
        </SidebarMenu>

        <SidebarMenu className={cn("mt-2", !sectionOpen && "hidden")}>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setDialog({ kind: "create-board", spaceId: null })}
              className="text-ink-3"
            >
              <PlusIcon />
              <span>New board</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setDialog({ kind: "create-space" })}
              className="text-ink-3"
            >
              <FolderPlusIcon />
              <span>Create space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/boards" />}
              className="text-ink-3"
            >
              <Settings2Icon />
              <span>Manage boards</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

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

// space === null is the "can't file this" group — a board shared with you whose owner's space you can't read via RLS
function SpaceRow({
  space,
  boards,
  userId,
  collapsed,
  onToggle,
  onDialog,
}: {
  space: ISpace | null;
  boards: IBoard[];
  userId: string | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onDialog: (dialog: Dialog) => void;
}) {
  const title = space?.title ?? "Unfiled";
  const newBoardLabel = space
    ? `New board in ${space.title}`
    : "New board, unfiled";

  return (
    <>
      <SidebarMenuItem className="mt-2 first:mt-0">
        <SidebarMenuButton
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
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
              "text-ink-3 coarse:opacity-100 size-3.5 opacity-0 transition-[opacity,transform] duration-150 group-hover/menu-item:opacity-100 group-focus-visible/menu-button:opacity-100",
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
                  <IconButton size="xs" label={`${space.title} options`} />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem
                  onClick={() => onDialog({ kind: "rename-space", space })}
                >
                  <PencilIcon />
                  Rename space
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
                  Delete space
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SidebarMenuActions>
      </SidebarMenuItem>

      {!collapsed && (
        <li className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150">
          <SidebarMenu>
            {boards.length === 0 ? (
              <SidebarMenuItem>
                <span className="text-ink-3 text-meta flex h-8 items-center pl-8">
                  {space ? "No boards" : "Nothing here"}
                </span>
              </SidebarMenuItem>
            ) : (
              boards.map((board) => (
                <BoardRow
                  key={board.id}
                  board={board}
                  owned={board.owner_id === userId}
                  onDialog={onDialog}
                />
              ))
            )}
          </SidebarMenu>
        </li>
      )}
    </>
  );
}

function BoardRow({
  board,
  owned,
  onDialog,
}: {
  board: IBoard;
  owned: boolean;
  onDialog: (dialog: Dialog) => void;
}) {
  const location = useLocation();

  const to = `/boards/${board.id}`;
  // startsWith, not equality: /boards/:id/settings/... is still this board, and
  // an exact match would un-highlight the row the moment settings opened. The
  // `/` guard keeps a sibling id whose prefix matches from lighting up too.
  const isActive =
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={to} />}
        isActive={isActive}
        className={cn("pl-8", owned && "coarse:pr-10 pr-8")}
      >
        <KanbanIcon />
        <span>{board.title || "Untitled board"}</span>
      </SidebarMenuButton>

      {owned && (
        <SidebarMenuActions>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <IconButton
                  size="xs"
                  label={`${board.title ?? "Board"} options`}
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
                Board settings
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDialog({ kind: "delete-board", board })}
              >
                <Trash2Icon />
                Delete board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuActions>
      )}
    </SidebarMenuItem>
  );
}
