import { useTranslation } from "react-i18next";
import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { PlusIcon } from "lucide-react";

import BoardFormModal from "@/components/boards/BoardFormModal";
import ActivityPanel from "@/components/forYou/ActivityPanel";
import FeedList from "@/components/forYou/FeedList";
import ForYouTabs from "@/components/forYou/ForYouTabs";
import RecentBoards from "@/components/forYou/RecentBoards";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import {
  isForYouTab,
  type FeedItem,
  type ForYouTab,
} from "@/services/forYou/feed";
import { FEED_PAGE } from "@/services/forYou/forYouApi";
import { useForYouFeed } from "@/services/forYou/useForYou";
import { readBoardVisits } from "@/services/forYou/viewed";
import { useProfile } from "@/services/profile/useProfile";
import { useSpaces } from "@/services/spaces/useSpaces";

function greetingKey(hour: number) {
  if (hour >= 5 && hour < 12) return "forYou.greeting.morning";
  if (hour >= 12 && hour < 18) return "forYou.greeting.afternoon";

  return "forYou.greeting.evening";
}

// `/` renders this instead of redirecting to your oldest board — every section here is a question about you, not about a board.
export default function ForYouPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { user } = useAuth();
  const { data: profile } = useProfile();
  const {
    data: boards = [],
    isLoading: boardsLoading,
    isSuccess: boardsLoaded,
  } = useBoards();
  const { data: spaces = [] } = useSpaces();

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

  const { items, isLoading, error, retry } = useForYouFeed(tab);

  // fixed at mount, not read per row — otherwise two rows a millisecond apart could land in different "Today"/"Yesterday" groups
  const [now] = useState(() => Date.now());
  const [visits] = useState(() => readBoardVisits(user?.id));

  const openTask = useCallback(
    (boardId: string, taskId: string) => {
      navigate(`/boards/${boardId}?task=${taskId}`);
    },
    [navigate],
  );

  const openItem = useCallback(
    (item: FeedItem) => {
      if (item.todo.board_id) openTask(item.todo.board_id, item.todo.id);
    },
    [openTask],
  );

  const name =
    profile?.full_name?.trim().split(/\s+/)[0] || profile?.username || "";

  const today = new Date(now).toLocaleDateString(i18n.language, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="motion-safe:animate-in motion-safe:slide-in-from-bottom-1 ease-emphasized mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pt-5 pb-12 duration-300 md:px-8 md:pt-8">
        <header className="flex items-start gap-3">
          <SidebarTrigger className="coarse:size-9 text-ink-2 hover:bg-ink/[0.06] mt-0.5 -ml-1 shrink-0 md:hidden" />

          <div className="min-w-0">
            <p className="text-ink-3 text-meta">{today}</p>

            <h1 className="text-ink mt-0.5 text-2xl font-semibold tracking-tight text-balance">
              {t(greetingKey(new Date(now).getHours()))}
              {name && `, ${name}`}
            </h1>
          </div>
        </header>

        {boardsLoaded && boards.length === 0 ? (
          <NoBoards onCreate={() => setCreating(true)} />
        ) : (
          <>
            <RecentBoards
              boards={boards}
              spaces={spaces}
              visits={visits}
              loading={boardsLoading}
            />

            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
              <section aria-labelledby="for-you-work" className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-3">
                  <h2
                    id="for-you-work"
                    className="text-ink text-sm font-semibold"
                  >
                    {t("forYou.yourWork")}
                  </h2>

                  <div className="order-last w-full md:order-none md:ml-auto md:w-auto">
                    <ForYouTabs
                      value={tab}
                      counts={{
                        // only assigned gets a count — recommended would just be the page length, viewed a badge for your own browsing
                        assigned: tab === "assigned" ? items.length : undefined,
                      }}
                      max={FEED_PAGE}
                      onChange={setTab}
                    />
                  </div>
                </div>

                <FeedList
                  tab={tab}
                  items={items}
                  isLoading={isLoading}
                  error={error}
                  onRetry={retry}
                  now={now}
                  currentUserId={user?.id}
                  avatarUrl={profile?.avatar_url}
                  initial={(profile?.username?.[0] || "?").toUpperCase()}
                  onOpen={openItem}
                />
              </section>

              <ActivityPanel boards={boards} onOpen={openTask} />
            </div>
          </>
        )}
      </div>

      {creating && <BoardFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NoBoards({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="border-hairline rounded-surface bg-surface flex min-h-[13rem] flex-col items-center justify-center gap-1 border border-dashed px-6 py-10 text-center">
      <p className="text-ink text-sm font-medium">{t("sidebar.noBoardsYet")}</p>

      <p className="text-ink-3 max-w-sm text-xs leading-relaxed text-pretty">
        {t("forYou.noBoardsHint")}
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="bg-brand text-brand-fg hover:bg-brand/90 rounded-control focus-visible:ring-brand focus-visible:ring-offset-surface text-meta mt-4 inline-flex h-9 items-center gap-1.5 px-3.5 font-medium transition-[background-color,scale] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:active:scale-[0.98]"
      >
        <PlusIcon className="size-4" />
        {t("boards.create")}
      </button>
    </div>
  );
}
