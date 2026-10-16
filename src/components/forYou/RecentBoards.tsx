import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowRightIcon } from "lucide-react";

import { SkeletonRegion } from "@/components/loading/ViewSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { recentBoards } from "@/services/forYou/feed";
import type { BoardVisit } from "@/services/forYou/viewed";
import type { IBoard, ISpace } from "@/types/data";

const SHOWN = 4;

const GRID = "grid grid-cols-2 gap-3 lg:grid-cols-4";

export default function RecentBoards({
  boards,
  spaces,
  visits,
  loading,
}: {
  boards: IBoard[];
  spaces: ISpace[];
  visits: BoardVisit[];
  loading: boolean;
}) {
  const { t } = useTranslation();

  const spaceById = useMemo(
    () => new Map(spaces.map((space) => [space.id, space.title])),
    [spaces],
  );

  const shortcuts = recentBoards(boards, visits, SHOWN);
  const visited = shortcuts.some((shortcut) => shortcut.visitedAt !== null);

  return (
    <section aria-labelledby="for-you-boards">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="for-you-boards" className="text-ink text-sm font-semibold">
          {t(visited ? "forYou.recentBoards" : "forYou.yourBoards")}
        </h2>

        <Link
          to="/boards"
          className="text-ink-3 hover:text-ink focus-visible:ring-brand rounded-control text-mini inline-flex items-center gap-1 font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
        >
          {t("forYou.allBoards")}
          <ArrowRightIcon className="size-3" />
        </Link>
      </div>

      {loading ? (
        <SkeletonRegion className={GRID}>
          {Array.from({ length: SHOWN }, (_, card) => (
            <div
              key={card}
              className="border-hairline bg-surface rounded-card flex items-center gap-3 border p-3"
            >
              <Skeleton className="rounded-control size-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-3/4 rounded-full" />
                <Skeleton className="mt-2 h-2.5 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </SkeletonRegion>
      ) : (
        <ul className={GRID}>
          {shortcuts.map(({ board }) => {
            const title = board.title || t("common.untitledBoard");
            const space = board.space_id
              ? spaceById.get(board.space_id)
              : undefined;

            return (
              <li key={board.id} className="min-w-0">
                <Link
                  to={`/boards/${board.id}`}
                  className="border-hairline bg-surface hover:border-ink/15 hover:bg-elevated hover:shadow-e2 focus-visible:ring-brand rounded-card flex items-center gap-3 border p-3 transition-[background-color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-2"
                >
                  <span
                    aria-hidden
                    className="bg-brand-soft text-brand rounded-control grid size-9 shrink-0 place-items-center text-sm font-semibold"
                  >
                    {title.trim().charAt(0).toUpperCase()}
                  </span>

                  <span className="min-w-0">
                    <span className="text-ink text-meta block truncate font-medium">
                      {title}
                    </span>
                    <span className="text-ink-3 text-mini block truncate">
                      {space ?? t("common.unfiled")} · {board.key_prefix}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
