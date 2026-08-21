import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  KanbanIcon,
  MoreHorizontalIcon,
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
import type { IBoard, ISpace } from "@/types/data";
import { cn } from "@/utils/cn";

/**
 * Boards, grouped by the space they are filed in (M15).
 *
 * Replaces the flat list this file used to render. The structure comes out of
 * `groupBoardsBySpace`, which is pure and tested — this component is the markup
 * and the modal state around it.
 *
 * **Ownership, not roles, gates the board menu.** Filing and deletion are both
 * owner-only in the database (the `boards_space_ownership` trigger and M2-01's
 * DELETE policy, which is `owner_id = auth.uid()`), and `board.owner_id` is
 * already on the row — so the check is free. `usePermissions` is the right tool
 * on a board *page*, where the roster is loaded anyway; here it would mean one
 * `board_roster` RPC per board in the list.
 *
 * The consequence, stated: an **admin** on someone else's board sees no menu
 * here, though M3-17 does let them rename it. Renaming from a board-level
 * surface is M17's, and the database has always been the enforcement either
 * way.
 */

/** Which dialog is open, and about what. Null is "none". */
type Dialog =
  | { kind: "create-board"; spaceId: string | null }
  | { kind: "edit-board"; board: IBoard }
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

  /**
   * Which spaces are folded away. Client-only and never persisted — the same
   * idiom `KanbanBoard` uses for collapsed columns, and for the same reason: it
   * is how one person is looking at the tree right now, not a property of the
   * space.
   */
  const [collapsed, setCollapsed] = useState<string[]>([]);

  /** Whether the whole SPACES section is folded away. */
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
        {/* The section label is a control now, not a caption. A sidebar whose
            only structure is one flat list of boards has nothing to fold; one
            that groups them by space does, and the person with four spaces
            wants the ones they are not in out of the way. */}
        <SidebarGroupLabel
          render={
            <button
              type="button"
              onClick={() => setSectionOpen((open) => !open)}
              aria-expanded={sectionOpen}
            />
          }
          className="text-ink-3 hover:text-ink-2 group/label flex w-full items-center gap-1 text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors"
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
              <span className="text-ink-3 px-2 py-1.5 text-[13px]">
                Loading…
              </span>
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

        {/* Both creates, persistent and side by side. The `+` on a space row is
            a shortcut for people who have found it; a sidebar whose only path to
            a new board is a hover target on a row is a sidebar that looks like
            it cannot make one. */}
        <SidebarMenu className={cn(!sectionOpen && "hidden")}>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setDialog({ kind: "create-board", spaceId: null })}
              className="text-ink-3 hover:text-ink h-8 text-[13px]"
            >
              <PlusIcon className="size-4 shrink-0" />
              <span>New board</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setDialog({ kind: "create-space" })}
              className="text-ink-3 hover:text-ink h-8 text-[13px]"
            >
              <FolderPlusIcon className="size-4 shrink-0" />
              <span>Create space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      {dialog?.kind === "create-board" && (
        <BoardFormModal spaceId={dialog.spaceId} onClose={close} />
      )}

      {dialog?.kind === "edit-board" && (
        <BoardFormModal board={dialog.board} onClose={close} />
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

/**
 * One space heading and the boards under it.
 *
 * `space === null` is the synthetic group — the boards that are in no space of
 * *yours*. Since M23 that no longer means "your default folder": every account
 * gets a real space called Unfiled, so what falls through to here is a board
 * you cannot file, which in practice means one shared with you (its `space_id`
 * names its owner's space, which your RLS cannot read). It is labelled for what
 * it now is, and it has no ⋯ because there is still no row behind it.
 */
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
      <SidebarMenuItem className="mt-2 first:mt-0">
        <div className="text-ink-2 group/space flex items-center gap-1.5 px-1 py-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${space?.title ?? "Not in a space"}`}
            className="hover:text-ink shrink-0 rounded p-0.5 transition-colors duration-150"
          >
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform",
                !collapsed && "rotate-90",
              )}
            />
          </button>

          {/* A space reads as an object, not a text row (M17 pass 2). The
              initial on a brand-soft square is the smallest thing that does
              that, and it stays on-palette — the reference's per-space colours
              would mean inventing a colour assignment the data does not carry. */}
          {space ? (
            <span className="bg-brand-soft text-brand grid size-4.5 shrink-0 place-items-center rounded text-[10px] font-bold">
              {space.title.trim().charAt(0).toUpperCase()}
            </span>
          ) : (
            <FolderIcon className="text-ink-3 size-3.5 shrink-0" />
          )}

          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {space ? space.title : "Not in a space"}
          </span>

          <button
            type="button"
            title={
              space ? `New board in ${space.title}` : "New board, in no space"
            }
            onClick={() =>
              onDialog({ kind: "create-board", spaceId: space?.id ?? null })
            }
            // Always visible below `md`, revealed on hover above it (M22). A
            // pointer-only affordance is unreachable on a touch screen — there
            // is no hover to trigger it — so the only way to add a board inside
            // a space on a phone was not to.
            className="hover:text-ink rounded p-0.5 transition-opacity duration-150 max-md:opacity-100 md:opacity-0 md:group-focus-within/space:opacity-100 md:group-hover/space:opacity-100"
          >
            <PlusIcon className="size-3.5" />
            <span className="sr-only">
              {space ? `New board in ${space.title}` : "New board, in no space"}
            </span>
          </button>

          {space && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`${space.title} options`}
                  // Same rule as the `+` above: rename and delete were both
                  // unreachable on touch before M22.
                  // **Always visible, on every space** (M23). It was revealed
                  // on hover, which made rename and delete undiscoverable —
                  // there is nothing on the row to suggest a menu exists, so
                  // the only way to find it was to sweep the pointer over a
                  // heading. `SidebarMenuAction`'s `showOnHover` is right for a
                  // board row, where the list is long and the menu is a
                  // repeat-per-item; a space heading appears a handful of times
                  // and its menu is the only way to manage the space at all.
                  className="hover:text-ink hover:bg-ink/[0.06] rounded p-0.5 transition-colors duration-150"
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
        // A guide rail down the left, so the boards read as children of the
        // space above them rather than as more rows in one flat list. Drawn on
        // the wrapper rather than per row, or every row would restate it.
        <div className="border-hairline motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 ml-[1.1rem] border-l pl-1 motion-safe:duration-150">
          {boards.length === 0 ? (
            <SidebarMenuItem>
              <span className="text-ink-3 block px-2 py-1 pl-3 text-[13px] italic">
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
  const isActive = location.pathname === to;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={to} />}
        isActive={isActive}
        className={cn(
          "pl-6",
          isActive ? "bg-brand-soft text-ink font-medium" : "text-ink-2",
        )}
      >
        <KanbanIcon
          className={cn("size-4 shrink-0", isActive && "text-brand")}
        />
        <span className="truncate">{board.title || "Untitled board"}</span>
      </SidebarMenuButton>

      {/* Only the owner's. Everything in this menu is refused by the database
          for anyone else, so offering it would be a button that fails. */}
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
              onClick={() => onDialog({ kind: "edit-board", board })}
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
