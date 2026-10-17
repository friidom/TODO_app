import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ArrowLeftRightIcon, GitBranchIcon, Loader2 } from "lucide-react";

import GitLabLinkCard, {
  ACTION,
  ProjectName,
  StatusBadge,
  SUBMIT,
} from "./GitLabLinkCard";
import { Field } from "@/components/boardSettings/BoardSettingsShell";
import EmptyState from "@/components/ui/EmptyState";
import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { useBoards } from "@/services/boards/useBoards";
import type { BoardGitLabLink } from "@/services/gitlab/gitlabApi";
import { useConnectSpaceGitLab } from "@/services/gitlab/useGitLabLinkMutations";
import { useSpaceGitLab } from "@/services/gitlab/useGitLabLinks";
import type { ISpace } from "@/types/data";
import { cn } from "@/utils/cn";

export default function SpaceGitLabIntegration({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const gitlab = useSpaceGitLab(space.id);
  const { data: boards = [] } = useBoards();
  const [changing, setChanging] = useState(false);

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

  const { configured, link, board_links: boardLinks } = gitlab.data;
  const filed = boards
    .filter((board) => board.space_id === space.id)
    .map((board) => board.title || t("common.untitledBoard"))
    .sort((a, b) => a.localeCompare(b));

  return (
    <>
      {!configured && (
        <p
          role="status"
          className="border-status-orange/30 bg-status-orange/10 text-status-orange rounded-control border px-3 py-2 text-xs"
        >
          {t("gitlab.notConfigured")}
        </p>
      )}

      {boardLinks.length > 0 && (
        <BoardLinks links={boardLinks} configured={configured} />
      )}

      {link ? (
        <GitLabLinkCard
          link={link}
          owner={{ spaceId: space.id }}
          configured={configured}
          disconnectMessage={t("gitlab.disconnectSpaceConfirm", {
            project: link.project_path,
          })}
          actions={
            !changing && (
              <button
                type="button"
                onClick={() => setChanging(true)}
                className={cn(ACTION, "h-8")}
              >
                <ArrowLeftRightIcon className="size-3.5" />
                {t("gitlab.changeProject")}
              </button>
            )
          }
        />
      ) : (
        <EmptyState
          size="sm"
          icon={GitBranchIcon}
          title={t("gitlab.emptyTitle")}
          hint={t("gitlab.emptyHint")}
          className="border-hairline rounded-control border border-dashed"
        />
      )}

      {(link === null || changing) && (
        <ConnectForm
          spaceId={space.id}
          replacing={link?.project_path ?? null}
          replacesBoardLinks={boardLinks.length > 0}
          onDone={link === null ? undefined : () => setChanging(false)}
        />
      )}

      <p className="text-ink-3 border-hairline border-t pt-4 text-xs">
        {filed.length === 0
          ? t("gitlab.noBoardsYet")
          : t(link ? "gitlab.boardsUsing" : "gitlab.boardsWillUse", {
              boards: filed.join(", "),
            })}
      </p>
    </>
  );
}

// Connections boards made before GitLab moved to spaces. They keep working for
// their own board, so the owner sees what connecting here will replace.
function BoardLinks({
  links,
  configured,
}: {
  links: BoardGitLabLink[];
  configured: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="note"
      className="border-status-blue/30 bg-status-blue/5 rounded-control flex flex-col gap-3 border p-3"
    >
      <div>
        <p className="text-ink text-xs font-medium">
          {t("gitlab.boardLinksTitle")}
        </p>
        <p className="text-ink-2 mt-0.5 text-xs leading-relaxed">
          {t("gitlab.boardLinksHint")}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li
            key={link.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span className="text-ink-2 w-full text-xs font-medium sm:w-40 sm:truncate">
              {link.board.title || t("common.untitledBoard")}
              <span className="text-ink-3 ml-1.5 font-mono">
                {link.board.key_prefix}
              </span>
            </span>

            <ProjectName path={link.project_path} url={link.project_url} />

            <StatusBadge status={link.status} configured={configured} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConnectForm({
  spaceId,
  replacing,
  replacesBoardLinks,
  onDone,
}: {
  spaceId: string;
  replacing: string | null;
  replacesBoardLinks: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const connect = useConnectSpaceGitLab(spaceId);
  const [projectUrl, setProjectUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const missing = projectUrl.trim() === "";
  const error =
    submitted && missing
      ? t("gitlab.projectUrlRequired")
      : connect.error?.message;
  const replaces = replacing !== null || replacesBoardLinks;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    if (missing) return;

    connect.mutate(
      { projectUrl: projectUrl.trim() },
      {
        onSuccess: () => {
          setProjectUrl("");
          setSubmitted(false);
          onDone?.();
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Field
        label={replacing ? t("gitlab.newProjectUrl") : t("gitlab.projectUrl")}
        hint={t("gitlab.projectUrlHint")}
      >
        <input
          value={projectUrl}
          autoFocus={replacing !== null}
          onChange={(event) => {
            setProjectUrl(event.target.value);
            connect.reset();
          }}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://gitlab.com/group/project"
          aria-invalid={error !== undefined}
          className={cn(FIELD_INPUT, error && FIELD_INPUT_INVALID)}
        />
      </Field>

      {replacing && (
        <p className="text-ink-2 text-xs leading-relaxed">
          {t("gitlab.replaceWarning", { current: replacing })}
        </p>
      )}

      {replacesBoardLinks && (
        <p className="text-ink-2 text-xs leading-relaxed">
          {t("gitlab.replaceBoardLinksWarning")}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {error && (
          <p role="alert" className="text-status-red mr-auto text-xs">
            {error}
          </p>
        )}

        {onDone && (
          <button
            type="button"
            disabled={connect.isPending}
            onClick={onDone}
            className={ACTION}
          >
            {t("common.cancel")}
          </button>
        )}

        <button type="submit" disabled={connect.isPending} className={SUBMIT}>
          {connect.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {connect.isPending
            ? t("gitlab.connecting")
            : replaces
              ? t("gitlab.replaceAndConnect")
              : t("gitlab.connect")}
        </button>
      </div>
    </form>
  );
}
