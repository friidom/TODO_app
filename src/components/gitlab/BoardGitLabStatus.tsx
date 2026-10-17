import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowRightIcon, Loader2 } from "lucide-react";

import GitLabLinkCard, {
  ACTION,
  ProjectName,
  StatusBadge,
} from "./GitLabLinkCard";
import {
  boardGitLabSource,
  type BoardGitLabSource,
} from "@/services/gitlab/gitlabLinks";
import { useBoardGitLab } from "@/services/gitlab/useGitLabLinks";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";
import { relativeTime } from "@/utils/relativeTime";

const NOT_CONNECTED: Record<Exclude<BoardGitLabSource, "space">, string> = {
  ownSpace: "gitlab.board.ownSpaceEmpty",
  otherSpace: "gitlab.board.otherSpaceEmpty",
  unfiled: "gitlab.board.unfiled",
};

// Read-only: a board has no project of its own. It shows what it inherits and
// where that is managed, plus any connection the board made before GitLab moved
// to spaces, which stays repairable here until the space replaces it.
export default function BoardGitLabStatus({ board }: { board: IBoard }) {
  const { t } = useTranslation();
  const gitlab = useBoardGitLab(board.id);
  const { data: spaces = [] } = useSpaces();
  const ownSpace = spaces.find((space) => space.id === board.space_id);

  if (gitlab.data === undefined) {
    return gitlab.isError ? (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-status-red text-xs">
          {t("gitlab.loadFailed")}
        </p>

        <button
          type="button"
          onClick={() => void gitlab.refetch()}
          className={ACTION}
        >
          {t("common.retry")}
        </button>
      </div>
    ) : (
      <Loader2 className="text-ink-3 size-4 animate-spin" />
    );
  }

  const {
    space_link: spaceLink,
    board_links: boardLinks,
    configured,
  } = gitlab.data;
  const source = boardGitLabSource({
    spaceId: board.space_id,
    ownsSpace: ownSpace !== undefined,
    spaceLinked: spaceLink !== null,
  });

  const manage = ownSpace && (
    <Link to={`/spaces/${ownSpace.id}/settings`} className={ACTION}>
      {spaceLink ? t("gitlab.board.manage") : t("gitlab.board.connect")}
      <ArrowRightIcon className="size-3.5" />
    </Link>
  );

  return (
    <>
      {spaceLink ? (
        <div className="border-hairline rounded-control flex flex-col gap-3 border px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <ProjectName
                path={spaceLink.project_path}
                url={spaceLink.project_url}
              />

              <StatusBadge status={spaceLink.status} configured={configured} />
            </div>

            {manage}
          </div>

          <p className="text-ink-2 text-xs">
            {ownSpace
              ? t("gitlab.board.viaSpace", { space: ownSpace.title })
              : t("gitlab.board.viaOwnersSpace")}{" "}
            {spaceLink.last_delivery_at &&
              t("gitlab.board.lastDelivery", {
                time: relativeTime(spaceLink.last_delivery_at) ?? "",
              })}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-ink-2 min-w-0 flex-1 text-sm">
            {source !== "space" &&
              t(NOT_CONNECTED[source], { space: ownSpace?.title ?? "" })}
          </p>

          {manage}
        </div>
      )}

      {boardLinks.map((link) => (
        <GitLabLinkCard
          key={link.id}
          link={link}
          owner={{ boardId: board.id }}
          configured={configured}
          disconnectMessage={t("gitlab.disconnectBoardConfirm", {
            project: link.project_path,
          })}
          note={
            <p
              role="note"
              className="border-status-blue/30 bg-status-blue/5 text-ink-2 rounded-control border px-3 py-2 text-xs leading-relaxed"
            >
              {spaceLink
                ? t("gitlab.board.ownLinkSuperseded")
                : t("gitlab.board.ownLink")}
            </p>
          }
        />
      ))}
    </>
  );
}
