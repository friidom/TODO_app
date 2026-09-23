import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { FilterIcon } from "lucide-react";

import Layout from "@/components/layout/Layout";
import FeedRow from "@/components/forYou/FeedRow";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import { useScopedColumns } from "@/hooks/useScopedColumns";
import { useScopedTodos } from "@/hooks/useScopedTodos";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import { useProfile } from "@/services/profile/useProfile";
import { toFeedItems } from "@/services/forYou/feed";
import { readViewed } from "@/services/forYou/viewed";
import { doneColumnIds } from "@/services/todos/subtasks";
import { topLevelTodos } from "@/services/todos/subtasks";
import { sortTodos } from "@/services/todos/view";
import {
  FILTER_DEFINITIONS,
  isFilterId,
  type FilterContext,
  type FilterId,
} from "@/services/filters/registry";
import type { Todo } from "@/types/data";

export default function FilterPage() {
  const { filterId } = useParams();

  // An unknown id is a dead link, not an error page — send it to the default.
  if (!isFilterId(filterId)) return <Navigate to="/filters/my-open" replace />;

  return <Filter id={filterId} />;
}

function Filter({ id }: { id: FilterId }) {
  const definition = FILTER_DEFINITIONS[id];

  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: boards = [] } = useBoards();
  const { todos: rows, isLoading } = useScopedTodos(definition.scope);
  const { columns, isLoading: columnsLoading } = useScopedColumns(
    definition.scope,
  );

  // Fixed at mount, for the reason ForYouPage records: two rows a millisecond
  // apart must not land in different "Today"/"Yesterday" groups.
  const [now] = useState(() => Date.now());
  const navigate = useNavigate();

  const context: FilterContext = useMemo(
    () => ({ userId: user?.id, doneColumnIds: doneColumnIds(columns) }),
    [user?.id, columns],
  );

  const items = useMemo(() => {
    // Subtasks are dropped first, the way useVisibleTodos does it for the board.
    const all = topLevelTodos(rows);

    if (definition.source === "viewed") {
      // The set comes from this browser; the order is when it saw each card.
      const seen = readViewed();
      const at = new Map(seen.map((entry) => [entry.id, entry.at]));
      const byId = new Map(all.map((todo) => [todo.id, todo]));

      const found = seen
        .map((entry) => byId.get(entry.id))
        .filter((todo): todo is Todo => todo !== undefined);

      return toFeedItems(found, boards, (todo) => at.get(todo.id) ?? null);
    }

    const matching = definition.match
      ? all.filter((todo) => definition.match!(todo, context))
      : all;

    const ordered = definition.sort
      ? sortTodos(matching, definition.sort.key, definition.sort.dir)
      : matching;

    return toFeedItems(ordered, boards, (todo) =>
      definition.sort?.key === "completed"
        ? todo.completed_at
        : (todo.updated_at ?? todo.created_at),
    );
  }, [rows, boards, context, definition]);

  const busy = isLoading || columnsLoading;

  return (
    <Layout>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-5 pt-4 pb-10 md:px-6">
          <div className="mb-4 flex items-center gap-3">
            <SidebarTrigger className="coarse:size-9 text-ink-3 hover:text-ink shrink-0 md:hidden" />

            <h1 className="text-ink text-base font-semibold tracking-tight">
              {definition.label}
            </h1>

            {!busy && (
              <span className="bg-ink/10 text-ink-3 text-mini rounded px-1.5 py-0.5 font-semibold tabular-nums">
                {items.length}
              </span>
            )}
          </div>

          {busy ? (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={FilterIcon}
              title="Nothing here yet"
              hint={`No work items match “${definition.label}”.`}
            />
          ) : (
            <ul className="border-hairline bg-surface rounded-card divide-ink/[0.06] divide-y overflow-hidden border">
              {items.map((item) => (
                <FeedRow
                  key={item.todo.id}
                  item={item}
                  now={now}
                  isMine={item.todo.assignee_id === user?.id}
                  avatarUrl={profile?.avatar_url}
                  initial={(profile?.username ?? "?").slice(0, 1).toUpperCase()}
                  // Opens on the owning board, the way the For You feed does —
                  // a task overlay needs a board to resolve against.
                  onOpen={() =>
                    void navigate(
                      `/boards/${item.todo.board_id}?task=${item.todo.id}`,
                    )
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
