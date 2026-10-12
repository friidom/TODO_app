import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeftIcon, FolderIcon, Loader2 } from "lucide-react";

import { Section } from "@/components/boardSettings/BoardSettingsShell";
import SpaceGitLabIntegration from "@/components/gitlab/SpaceGitLabIntegration";
import EmptyState from "@/components/ui/EmptyState";
import { useBoards } from "@/services/boards/useBoards";
import { useSpaces } from "@/services/spaces/useSpaces";

// Outside the app shell, like Board Settings: a place you finish with and
// leave. A space is visible only to its owner, so "not among my spaces" is the
// same answer for a missing space and for someone else's.
export default function SpaceSettingsPage() {
  const { t } = useTranslation();
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { data: spaces, isPending } = useSpaces();
  const { data: boards = [] } = useBoards();
  const space = spaces?.find((candidate) => candidate.id === spaceId);

  if (isPending) {
    return (
      <div className="bg-canvas grid h-svh place-items-center">
        <Loader2 className="text-ink-3 size-5 animate-spin" />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="bg-canvas grid h-svh place-items-center px-5">
        <EmptyState
          icon={FolderIcon}
          title={t("spaceSettings.notFoundTitle")}
          hint={t("spaceSettings.notFoundHint")}
          action={{
            label: t("sidebar.manageBoards"),
            run: () => void navigate("/boards"),
          }}
        />
      </div>
    );
  }

  const firstBoard = boards.find((board) => board.space_id === space.id);

  return (
    <div className="bg-canvas flex h-svh flex-col overflow-hidden">
      <header className="border-hairline flex min-h-12 shrink-0 items-center border-b px-5 md:px-6">
        <Link
          to="/boards"
          className="border-hairline text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control text-meta flex h-8 items-center gap-1.5 border px-2.5 transition-colors outline-none focus-visible:ring-2"
        >
          <ArrowLeftIcon className="size-3.5 shrink-0" />
          {t("sidebar.manageBoards")}
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 py-8 md:px-6">
          <p className="text-ink-3 text-mini mb-1 font-semibold tracking-[0.1em] uppercase">
            {t("spaceSettings.title")}
          </p>

          <h1 className="text-ink mb-6 truncate text-lg font-semibold">
            {space.title}
          </h1>

          <Section
            title={t("gitlab.title")}
            hint={t("gitlab.spaceHint", {
              example: `${firstBoard?.key_prefix ?? "API"}-12`,
            })}
          >
            <SpaceGitLabIntegration space={space} />
          </Section>
        </div>
      </div>
    </div>
  );
}
