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

// `/` renders this instead of redirecting to your oldest board — every tab here is a question about you, not about a board.
export default function ForYouPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: boards, isLoading: boardsLoading } = useBoards();

  const [creating, setCreating] = useState(false);

  const raw = searchParams.get("tab");
  const tab: ForYouTab = isForYouTab(raw) ? raw : "recommended";

  // replace: true so flipping through tabs doesn't cost five presses of the back button.
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

  // fixed at mount, not read per row — otherwise two rows a millisecond apart could land in different "Today"/"Yesterday" groups
  const [now] = useState(() => Date.now());

  const openTask = useCallback(
    (item: FeedItem) => {
      if (!item.todo.board_id) return;

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
            <SidebarTrigger className="coarse:size-9 text-ink-2 hover:bg-ink/[0.06] -ml-1 shrink-0 md:hidden" />

            <h1 className="text-ink text-xl font-semibold tracking-tight">
              For You
            </h1>

            <div className="order-last w-full md:order-none md:ml-auto md:w-auto">
              <ForYouTabs
                value={tab}
                counts={{
                  // only assigned gets a count — recommended would just be the page length, viewed a badge for your own browsing
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
        className="bg-brand text-brand-fg hover:bg-brand/90 rounded-control focus-visible:ring-brand focus-visible:ring-offset-surface text-meta mt-4 inline-flex h-9 items-center gap-1.5 px-3.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <PlusIcon className="size-4" />
        Create board
      </button>
    </div>
  );
}
