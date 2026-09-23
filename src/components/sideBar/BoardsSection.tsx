import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  KanbanIcon,
  MoreHorizontalIcon,
  Settings2Icon,
  PlusIcon,
} from "lucide-react";

import BoardFormModal from "@/components/boards/BoardFormModal";
import DeleteBoardModal from "@/components/boards/DeleteBoardModal";
import DeleteSpaceModal from "@/components/spaces/DeleteSpaceModal";
import SpaceFormModal from "@/components/spaces/SpaceFormModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
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
        <SidebarGroupLabel
          render={
            <button
              type="button"
              onClick={() => setSectionOpen((open) => !open)}
              aria-expanded={sectionOpen}
            />
          }
          className="text-ink-3 hover:text-ink-2 group/label text-micro flex w-full items-center gap-1 font-semibold tracking-[0.12em] uppercase transition-colors"
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 transition-transform duration-150",
              sectionOpen && "rotate-90",
            )}
          />
          Spaces
        </SidebarGroupLabel>

        <SidebarMenu
          className={cn(
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
            !sectionOpen && "hidden",
          )}
        >
          {isPending && (
            <SidebarMenuItem>
              <span className="text-ink-3 text-meta px-2 py-1.5">Loading…</span>
            </SidebarMenuItem>
          )}

          {!isPending && boards.length === 0 && spaces.length === 0 && (
            <SidebarMenuItem>
              <span className="text-ink-3 px-2 py-1.5 text-sm">
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

        <SidebarMenu className={cn("mt-3", !sectionOpen && "hidden")}>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setDialog({ kind: "create-board", spaceId: null })}
              className="text-ink-3 hover:text-ink text-meta h-8"
            >
              <PlusIcon className="size-4 shrink-0" />
              <span>New board</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setDialog({ kind: "create-space" })}
              className="text-ink-3 hover:text-ink text-meta h-8"
            >
              <FolderPlusIcon className="size-4 shrink-0" />
              <span>Create space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/boards" />}
              className="text-ink-3 hover:text-ink text-meta h-8"
            >
              <Settings2Icon className="size-4 shrink-0" />
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
  return (
    <>
      <SidebarMenuItem className="mt-3 first:mt-0">
        <div className="text-ink-2 group/space flex items-center gap-1.5 px-1 py-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${space?.title ?? "Unfiled"}`}
            className="hover:text-ink coarse:size-8 coarse:p-0 coarse:grid coarse:place-items-center shrink-0 rounded p-0.5 transition-colors duration-150"
          >
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform",
                !collapsed && "rotate-90",
              )}
            />
          </button>

          {space ? (
            <span className="bg-brand-soft text-brand text-micro grid size-4.5 shrink-0 place-items-center rounded font-bold">
              {space.title.trim().charAt(0).toUpperCase()}
            </span>
          ) : (
            <FolderIcon className="text-ink-3 size-3.5 shrink-0" />
          )}

          <span className="text-meta min-w-0 flex-1 truncate font-semibold">
            {space ? space.title : "Unfiled"}
          </span>

          <button
            type="button"
            title={space ? `New board in ${space.title}` : "New board, unfiled"}
            onClick={() =>
              onDialog({ kind: "create-board", spaceId: space?.id ?? null })
            }
            // always visible below md — hover-only would be unreachable on touch
            className="hover:text-ink coarse:size-8 coarse:p-0 coarse:grid coarse:place-items-center rounded p-0.5 transition-opacity duration-150 max-md:opacity-100 md:opacity-0 md:group-focus-within/space:opacity-100 md:group-hover/space:opacity-100"
          >
            <PlusIcon className="size-3.5" />
            <span className="sr-only">
              {space ? `New board in ${space.title}` : "New board, unfiled"}
            </span>
          </button>

          {space && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`${space.title} options`}
                  // same hover rule as the + beside it, and always visible
                  // below md where hover does not exist
                  className="hover:text-ink hover:bg-ink/[0.06] coarse:size-8 coarse:p-0 coarse:grid coarse:place-items-center rounded p-0.5 transition-all duration-150 max-md:opacity-100 md:opacity-0 md:group-focus-within/space:opacity-100 md:group-hover/space:opacity-100"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem
                    onClick={() => onDialog({ kind: "rename-space", space })}
                  >
                    Rename space
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() =>
                      onDialog({
                        kind: "delete-space",
                        space,
                        boardCount: boards.length,
                      })
                    }
                    className="text-status-red"
                  >
                    Delete space
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </SidebarMenuItem>

      {!collapsed && (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150">
          {boards.length === 0 ? (
            <SidebarMenuItem>
              <span className="text-ink-3 text-meta block py-1 pl-7">
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
        </div>
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
        className={cn(
          "relative pl-7",
          // pseudo-element rail so the active mark costs no layout and the row can't shift
          isActive
            ? "bg-brand-soft text-ink before:bg-brand font-medium before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-r-full"
            : "text-ink-2",
        )}
      >
        <KanbanIcon
          className={cn("size-4 shrink-0", isActive && "text-brand")}
        />
        <span className="truncate">{board.title || "Untitled board"}</span>
      </SidebarMenuButton>

      {owned && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuAction
                showOnHover
                aria-label={`${board.title ?? "Board"} options`}
              >
                <MoreHorizontalIcon className="size-4" />
              </SidebarMenuAction>
            }
          />

          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem
              render={<Link to={boardSettingsPath(board.id, "details")} />}
            >
              Board settings
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => onDialog({ kind: "delete-board", board })}
              className="text-status-red"
            >
              Delete board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  );
}
