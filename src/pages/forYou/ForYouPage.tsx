import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { PlusIcon } from "lucide-react";

import BoardFormModal from "@/components/boards/BoardFormModal";
import FeedList from "@/components/forYou/FeedList";
import ForYouTabs from "@/components/forYou/ForYouTabs";
import Layout from "@/components/layout/Layout";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import {
  isForYouTab,
  type FeedItem,
  type ForYouTab,
} from "@/services/forYou/feed";
import { useForYouFeed } from "@/services/forYou/useForYou";
import { recordView } from "@/services/forYou/viewed";
import { useProfile } from "@/services/profile/useProfile";

/**
 * The personal work hub — what `/` renders (M21).
 *
 * **It replaced a redirect.** `/` used to send you to your oldest board, which
 * meant the app had no home: the first thing you saw was one arbitrary board's
 * Kanban, whatever you had actually been doing. This is the answer to "what
 * should I look at", and every tab on it is a question about *you* rather than
 * about a board — which is why none of its queries take a board id and all of
 * them lean on RLS instead.
 *
 * **Nothing here is a second task system.** A row is a `Todo` from the same
 * `TODO_LIST_FIELDS` projection every board renders, its board name comes from
 * the `useBoards()` entry the sidebar already holds, and clicking one navigates
 * to `/boards/:id?task=:todoId` — the existing detail modal, addressed the way
 * `useOpenTask` has always addressed it. There is no detail view here to keep
 * in step with that one.
 *
 * **The no-boards case moved here with the route.** `BoardIndexRoute` used to
 * own it; deleting the redirect without carrying it over would strand a new
 * account on an empty feed with no way to make anything.
 */
export default function ForYouPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: boards, isLoading: boardsLoading } = useBoards();

  const [creating, setCreating] = useState(false);

  const raw = searchParams.get("tab");
  const tab: ForYouTab = isForYouTab(raw) ? raw : "recommended";

  /**
   * The tab lives in the URL, matching every other view state in the app.
   *
   * `replace: true` for the same reason `useBoardView` uses it: clicking
   * through five filters should not cost five presses of the back button. The
   * default is cleared rather than written, so a shared `/` link opens on
   * Recommended.
   */
  const setTab = useCallback(
    (next: ForYouTab) =>
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);

          if (next === "recommended") params.delete("tab");
          else params.set("tab", next);

          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const { items, isLoading, error } = useForYouFeed(tab);

  /**
   * One clock for the whole render.
   *
   * Fixed at mount rather than read per row: the group headers and the relative
   * stamps have to agree, and a component that called `Date.now()` in each row
   * could file two rows a millisecond apart under "Today" and "Yesterday". It
   * going stale on a long-open tab is the right trade — the alternative is a
   * timer re-rendering the feed to turn "5m ago" into "6m ago".
   */
  const [now] = useState(() => Date.now());

  const openTask = useCallback(
    (item: FeedItem) => {
      if (!item.todo.board_id) return;

      // Recorded here rather than inside the detail modal, because this is the
      // moment the user chose the task. See `services/forYou/viewed.ts` for why
      // the list is per-browser and holds ids only.
      recordView(item.todo.id, item.todo.board_id, new Date().toISOString());

      navigate(`/boards/${item.todo.board_id}?task=${item.todo.id}`);
    },
    [navigate],
  );

  const name = profile?.username || profile?.full_name || "";

  return (
    <Layout>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-5 pt-4 pb-10 md:px-6">
          <header className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-3">
            {/* The sidebar's only way back on a narrow screen — the board's
                copy lives in `BoardIdentity`, which this page does not have. */}
            <SidebarTrigger className="coarse:size-9 text-ink-2 hover:bg-ink/[0.06] -ml-1 shrink-0 md:hidden" />

            <h1 className="text-ink text-xl font-semibold tracking-tight">
              For You
            </h1>

            {/* Full width on a phone, where it wraps to its own line and the
                `-mx-5` bleed lets the last tab reach the screen edge instead of
                being clipped by the page gutter. Pushed right beside the title
                from `md` up, which is where the reference puts it. */}
            <div className="order-last w-full md:order-none md:ml-auto md:w-auto">
              <ForYouTabs
                value={tab}
                counts={{
                  // Only the tab whose number is both known and worth acting on.
                  // A count on Recommended would be the page's own length, and
                  // one on Viewed would be a badge for your own browsing.
                  assigned: tab === "assigned" ? items.length : undefined,
                }}
                onChange={setTab}
              />
            </div>
          </header>

          {!boardsLoading && boards?.length === 0 ? (
            <NoBoards onCreate={() => setCreating(true)} />
          ) : (
            <FeedList
              tab={tab}
              items={items}
              isLoading={isLoading}
              error={error}
              now={now}
              currentUserId={user?.id}
              avatarUrl={profile?.avatar_url}
              initial={(name[0] || "?").toUpperCase()}
              onOpen={openTask}
            />
          )}
        </div>
      </div>

      {creating && <BoardFormModal onClose={() => setCreating(false)} />}
    </Layout>
  );
}

/**
 * An account with no board at all.
 *
 * Carried over from `BoardIndexRoute`, which owned this state while `/` was a
 * redirect. Reachable two ways: a half-migrated account, and — deliberately,
 * since M15 — someone who has just deleted their last board.
 */
function NoBoards({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-hairline rounded-surface bg-surface flex min-h-[13rem] flex-col items-center justify-center gap-1 border border-dashed px-6 py-10 text-center">
      <p className="text-ink text-sm font-medium">No boards yet</p>

      <p className="text-ink-3 max-w-sm text-xs leading-relaxed">
        Create one to get started — it arrives with the four default columns,
        and whatever you put on it shows up here.
      </p>

      <button
        type="button"
        onClick={onCreate}
        // `h-9 px-3.5`, matching every other primary action in the product
        // (M22) — it was `px-3 py-2`, which rendered a button a couple of
        // pixels shorter than the ones in the dialogs beside it.
        className="bg-brand text-brand-fg hover:bg-brand/90 rounded-control focus-visible:ring-brand focus-visible:ring-offset-surface text-meta mt-4 inline-flex h-9 items-center gap-1.5 px-3.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <PlusIcon className="size-4" />
        Create board
      </button>
    </div>
  );
}
