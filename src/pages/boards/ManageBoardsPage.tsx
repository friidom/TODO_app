import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeftIcon, KanbanIcon, SearchIcon } from "lucide-react";

import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import EmptyState from "@/components/ui/EmptyState";
import { FIELD_INPUT } from "@/components/ui/fieldInput";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import { useSpaces } from "@/services/spaces/useSpaces";
import { relativeTime } from "@/utils/relativeTime";
import { cn } from "@/utils/cn";

const COLUMNS = "minmax(0,2fr) 5rem minmax(0,1fr) 6rem 7rem";

// A list, not an admin panel: no archive, no trash, no templates. Everything on
// it comes from useBoards()/useSpaces(), which the sidebar already loads.
export default function ManageBoardsPage() {
  const { data: boards, isLoading } = useBoards();
  const { data: spaces = [] } = useSpaces();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Local state, not a URL param: this is a transient way to find a row, not a
  // view worth sharing — which is the line useBoardView draws for the board.
  const [query, setQuery] = useState("");

  const spaceById = useMemo(
    () => new Map(spaces.map((space) => [space.id, space.title])),
    [spaces],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const all = (boards ?? [])
      .slice()
      .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));

    if (!needle) return all;

    return all.filter(
      (board) =>
        (board.title ?? "").toLowerCase().includes(needle) ||
        board.key_prefix.toLowerCase().includes(needle),
    );
  }, [boards, query]);

  return (
    <div className="bg-canvas flex h-svh flex-col overflow-hidden">
      <header className="border-hairline flex min-h-12 shrink-0 items-center border-b px-5 md:px-6">
        <Link
          to="/"
          className="border-hairline text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control text-meta flex h-8 items-center gap-1.5 border px-2.5 transition-colors outline-none focus-visible:ring-2"
        >
          <ArrowLeftIcon className="size-3.5 shrink-0" />
          Back
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-ink mr-auto text-base font-semibold tracking-tight">
              Manage boards
            </h1>

            <div className="relative w-full sm:w-64">
              <SearchIcon className="text-ink-3 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search boards"
                aria-label="Search boards"
                className={cn(FIELD_INPUT, "pl-8")}
              />
            </div>
          </div>

          {isLoading ? (
            <AdminSkeleton />
          ) : rows.length === 0 ? (
            <AdminEmpty>
              {query.trim() ? (
                `Nothing matches “${query.trim()}”.`
              ) : (
                <EmptyState
                  icon={KanbanIcon}
                  title="No boards yet"
                  hint="Create one from the sidebar to get started."
                  size="sm"
                />
              )}
            </AdminEmpty>
          ) : (
            <AdminGrid columns={COLUMNS} label="Boards">
              <AdminRow header>
                <AdminCell header>Name</AdminCell>
                <AdminCell header>Key</AdminCell>
                <AdminCell header>Space</AdminCell>
                <AdminCell header>Role</AdminCell>
                <AdminCell header align="right">
                  Updated
                </AdminCell>
              </AdminRow>

              {rows.map((board) => (
                <AdminRow
                  key={board.id}
                  onOpen={() => void navigate(`/boards/${board.id}`)}
                >
                  <AdminCell>
                    <span className="flex min-w-0 items-center gap-2">
                      <KanbanIcon className="text-ink-3 size-3.5 shrink-0" />
                      <span className="truncate font-medium">
                        {board.title || "Untitled board"}
                      </span>
                    </span>
                  </AdminCell>

                  <AdminCell>
                    <span className="text-ink-3 text-mini tabular-nums">
                      {board.key_prefix}
                    </span>
                  </AdminCell>

                  <AdminCell>
                    <span className="text-ink-3 truncate">
                      {board.space_id
                        ? (spaceById.get(board.space_id) ?? "Unfiled")
                        : "Unfiled"}
                    </span>
                  </AdminCell>

                  {/* The roster is per board and this page lists many, so the
                      one role answerable without N member fetches is ownership. */}
                  <AdminCell>
                    <span className="text-ink-3">
                      {board.owner_id === user?.id ? "Owner" : "Member"}
                    </span>
                  </AdminCell>

                  <AdminCell align="right">
                    <span className="text-ink-3 text-mini">
                      {relativeTime(board.updated_at) || "—"}
                    </span>
                  </AdminCell>
                </AdminRow>
              ))}
            </AdminGrid>
          )}
        </div>
      </div>
    </div>
  );
}
