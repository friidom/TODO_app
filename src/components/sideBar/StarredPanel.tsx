import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SearchIcon, StarIcon } from "lucide-react";

import StarButton from "@/components/stars/StarButton";
import { useBoards } from "@/services/boards/useBoards";
import { spaceNameOf } from "@/services/spaces/boardSpace";
import { useSpaces } from "@/services/spaces/useSpaces";
import { starredBoards } from "@/services/stars/starred";
import { useStarred } from "@/services/stars/useStars";
import type { IBoard, ISpace } from "@/types/data";
import {
  BoardChip,
  FlyoutError,
  FlyoutFrame,
  FlyoutSkeleton,
  FlyoutState,
} from "./flyoutParts";
import { FLYOUT_LINK, FLYOUT_ROW, flyoutRowProps } from "./flyoutChrome";

const NO_BOARDS: IBoard[] = [];
const NO_SPACES: ISpace[] = [];

export default function StarredPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const boards = useBoards();
  const stars = useStarred();
  const { data: spaces = NO_SPACES } = useSpaces();

  const all = useMemo(
    () => starredBoards(boards.data ?? NO_BOARDS, stars.data ?? []),
    [boards.data, stars.data],
  );

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? all.filter((board) =>
        [board.title, board.key_prefix, spaceNameOf(board, spaces)].some(
          (text) => text?.toLowerCase().includes(needle),
        ),
      )
    : all;

  const error = stars.error ?? boards.error;

  return (
    <FlyoutFrame
      title={t("starred.title")}
      onClose={onClose}
      query={query}
      onQuery={setQuery}
      searchLabel={t("starred.search")}
      footer={
        <Link to="/boards" onClick={onClose} className={FLYOUT_LINK}>
          {t("sidebar.manageBoards")}
        </Link>
      }
    >
      {error ? (
        <FlyoutError
          message={t("starred.loadFailed")}
          onRetry={() => {
            if (stars.error) void stars.refetch();
            if (boards.error) void boards.refetch();
          }}
        />
      ) : stars.isPending || boards.isPending ? (
        <FlyoutSkeleton rows={4} />
      ) : all.length === 0 ? (
        <FlyoutState
          icon={StarIcon}
          title={t("starred.empty")}
          hint={t("starred.emptyHint")}
        />
      ) : shown.length === 0 ? (
        <FlyoutState
          icon={SearchIcon}
          title={t("starred.noMatches", { query: query.trim() })}
        />
      ) : (
        <ul className="flex flex-col">
          {shown.map((board) => {
            const title = board.title || t("common.untitledBoard");
            const space = spaceNameOf(board, spaces);

            return (
              <li key={board.id} className="group/row flex items-center gap-1">
                <Link
                  to={`/boards/${board.id}`}
                  onClick={onClose}
                  className={FLYOUT_ROW}
                  {...flyoutRowProps}
                >
                  <BoardChip title={title} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink text-meta block truncate font-medium">
                      {title}
                    </span>
                    <span className="text-ink-3 text-mini block truncate">
                      {space && `${space} · `}
                      {board.key_prefix}
                    </span>
                  </span>
                </Link>

                <StarButton
                  boardId={board.id}
                  tooltipSide="left"
                  className="mr-1 shrink-0"
                />
              </li>
            );
          })}
        </ul>
      )}
    </FlyoutFrame>
  );
}
