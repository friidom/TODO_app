import { useTranslation } from "react-i18next";
import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  RotateCwIcon,
  type LucideIcon,
} from "lucide-react";

import SectionHeader, { EmptyLine } from "./SectionHeader";
import { INLINE_ACTION_BRAND } from "./detailChrome";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BRANCH_PREVIEW,
  COMMIT_PREVIEW,
  MERGE_REQUEST_PREVIEW,
  MERGE_REQUEST_STATE_LABEL,
  commitTooltip,
  developmentCount,
  orderMergeRequests,
  shortSha,
  spansProjects,
} from "@/services/gitlab/development";
import type {
  Development,
  DevelopmentBranch,
  DevelopmentCommit,
  DevelopmentMergeRequest,
  MergeRequestState,
} from "@/services/gitlab/gitlabApi";
import { useDevelopment } from "@/services/gitlab/useDevelopment";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

const MERGE_REQUEST_ICON: Record<MergeRequestState, LucideIcon> = {
  opened: GitPullRequestIcon,
  merged: GitMergeIcon,
  closed: GitPullRequestClosedIcon,
  locked: GitPullRequestIcon,
};

const MERGE_REQUEST_ICON_TONE: Record<MergeRequestState, string> = {
  opened: "text-status-green",
  merged: "text-status-blue",
  closed: "text-status-red",
  locked: "text-ink-3",
};

const MERGE_REQUEST_BADGE: Record<MergeRequestState, string> = {
  opened: "border-status-green/30 bg-status-green/10 text-status-green",
  merged: "border-status-blue/30 bg-status-blue/10 text-status-blue",
  closed: "border-status-red/30 bg-status-red/10 text-status-red",
  locked: "border-hairline bg-wash text-ink-3",
};

const SHA = "text-ink-3 font-mono text-xs tabular-nums";

// Renders nothing on a board without GitLab: a section that could only ever
// say so would sit on every task of every board that does not use it.
export default function DevelopmentSection({
  todoId,
  boardId,
  taskKey,
}: {
  todoId: string;
  boardId: string;
  taskKey: string | null;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const { data, isError, isFetching, refetch } = useDevelopment(
    boardId,
    todoId,
  );

  if (data && !data.connected) return null;

  const count = data ? developmentCount(data) : 0;

  return (
    <section>
      <SectionHeader
        title={t("development.title")}
        count={count > 0 ? count : null}
        collapse={{
          collapsed,
          onToggle: () => setCollapsed((open) => !open),
          noun: t("development.title"),
        }}
      />

      {!collapsed && (
        <DevelopmentBody
          development={data}
          failed={isError}
          retrying={isFetching}
          onRetry={() => void refetch()}
          taskKey={taskKey}
        />
      )}
    </section>
  );
}

function DevelopmentBody({
  development,
  failed,
  retrying,
  onRetry,
  taskKey,
}: {
  development: Development | undefined;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  taskKey: string | null;
}) {
  const { t } = useTranslation();

  if (development === undefined) {
    return failed ? (
      <div className="border-hairline rounded-card text-meta flex flex-wrap items-center gap-2 border px-3 py-2.5">
        <CircleAlertIcon className="text-status-red size-4 shrink-0" />

        <span className="text-ink-2 min-w-0 flex-1">
          {t("development.loadFailed")}
        </span>

        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className={cn(
            INLINE_ACTION_BRAND,
            "flex items-center gap-1.5 px-2 py-1 text-xs",
          )}
        >
          <RotateCwIcon
            className={cn("size-3.5", retrying && "animate-spin")}
          />
          {t("common.retry")}
        </button>
      </div>
    ) : (
      <div className="space-y-1.5" aria-busy>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }

  if (developmentCount(development) === 0) {
    return (
      <EmptyLine icon={GitBranchIcon}>
        <span>
          {t("development.none")}
          {taskKey && ` ${t("development.hint", { key: taskKey })}`}
        </span>
      </EmptyLine>
    );
  }

  return <DevelopmentLists development={development} />;
}

function DevelopmentLists({ development }: { development: Development }) {
  const { t } = useTranslation();
  const { commits, branches, merge_requests } = development;
  const showProject = spansProjects(development);

  return (
    <div className="space-y-3">
      {merge_requests.length > 0 && (
        <Group
          title={t("development.mergeRequests")}
          items={orderMergeRequests(merge_requests)}
          preview={MERGE_REQUEST_PREVIEW}
          render={(mergeRequest) => (
            <MergeRequestRow
              key={`${mergeRequest.project_path}!${mergeRequest.iid}`}
              mergeRequest={mergeRequest}
              showProject={showProject}
            />
          )}
        />
      )}

      {branches.length > 0 && (
        <Group
          title={t("development.branches")}
          items={branches}
          preview={BRANCH_PREVIEW}
          render={(branch) => (
            <BranchRow
              key={`${branch.project_path}:${branch.name}`}
              branch={branch}
              showProject={showProject}
            />
          )}
        />
      )}

      {commits.length > 0 && (
        <Group
          title={t("development.commits")}
          items={commits}
          preview={COMMIT_PREVIEW}
          render={(commit) => (
            <CommitRow
              key={`${commit.project_path}@${commit.sha}`}
              commit={commit}
              showProject={showProject}
            />
          )}
        />
      )}
    </div>
  );
}

// Expands in place, inside a capped scroll area, rather than in a dialog: a
// dialog over the task modal would take Escape with it (see AttachmentsSection).
function Group<T>({
  title,
  items,
  preview,
  render,
}: {
  title: string;
  items: readonly T[];
  preview: number;
  render: (item: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <h4 className="text-ink-3 text-micro mb-0.5 flex items-center gap-1.5 font-medium tracking-wide uppercase">
        {title}
        <span className="tabular-nums">{items.length}</span>
      </h4>

      <ul
        className={cn(
          "-mx-2",
          expanded && "max-h-80 overflow-y-auto overscroll-contain",
        )}
      >
        {(expanded ? items : items.slice(0, preview)).map((item) =>
          render(item),
        )}
      </ul>

      {items.length > preview && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className={cn(INLINE_ACTION_BRAND, "mt-0.5 text-xs")}
        >
          {expanded
            ? t("development.showLess")
            : t("development.showAll", { count: items.length })}
        </button>
      )}
    </div>
  );
}

function Row({
  href,
  tooltip,
  icon: Icon,
  tone = "text-ink-3",
  primary,
  secondary,
  aside,
}: {
  href: string;
  tooltip: string;
  icon: LucideIcon;
  tone?: string;
  primary: ReactNode;
  secondary: ReactNode;
  aside: ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={tooltip}
        className="group hover:bg-wash focus-visible:ring-brand rounded-control flex items-start gap-2.5 px-2 py-1.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />

        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-sm">{primary}</span>

          <span className="text-ink-3 mt-0.5 flex min-w-0 items-center gap-1 text-xs">
            {secondary}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          {aside}
          <ExternalLinkIcon
            aria-hidden
            className="text-ink-3 size-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </span>
      </a>
    </li>
  );
}

function MergeRequestRow({
  mergeRequest,
  showProject,
}: {
  mergeRequest: DevelopmentMergeRequest;
  showProject: boolean;
}) {
  const { t } = useTranslation();
  const { state } = mergeRequest;

  return (
    <Row
      href={mergeRequest.url}
      tooltip={`!${mergeRequest.iid} ${mergeRequest.title}`}
      icon={MERGE_REQUEST_ICON[state]}
      tone={MERGE_REQUEST_ICON_TONE[state]}
      primary={
        <>
          <span className="text-ink-3 mr-1.5 tabular-nums">
            !{mergeRequest.iid}
          </span>
          {mergeRequest.title}
        </>
      }
      secondary={
        <>
          <span className="min-w-0 truncate font-mono">
            {mergeRequest.source_branch}
          </span>
          <ArrowRightIcon aria-hidden className="size-3 shrink-0" />
          <span className="max-w-[40%] shrink-0 truncate font-mono">
            {mergeRequest.target_branch}
          </span>
          <span className="shrink-0">
            · {relativeTime(mergeRequest.updated_at)}
          </span>
          {showProject && (
            <span className="min-w-0 truncate">
              · {mergeRequest.project_path}
            </span>
          )}
        </>
      }
      aside={
        <span
          className={cn(
            "text-mini rounded-full border px-1.5 py-px font-medium whitespace-nowrap",
            MERGE_REQUEST_BADGE[state],
          )}
        >
          {t(MERGE_REQUEST_STATE_LABEL[state])}
        </span>
      }
    />
  );
}

function BranchRow({
  branch,
  showProject,
}: {
  branch: DevelopmentBranch;
  showProject: boolean;
}) {
  return (
    <Row
      href={branch.url}
      tooltip={branch.name}
      icon={GitBranchIcon}
      primary={<span className="font-mono">{branch.name}</span>}
      secondary={
        <>
          <span className="shrink-0">{relativeTime(branch.updated_at)}</span>
          {showProject && (
            <span className="min-w-0 truncate">· {branch.project_path}</span>
          )}
        </>
      }
      aside={<span className={SHA}>{shortSha(branch.head_sha)}</span>}
    />
  );
}

function CommitRow({
  commit,
  showProject,
}: {
  commit: DevelopmentCommit;
  showProject: boolean;
}) {
  return (
    <Row
      href={commit.url}
      tooltip={commitTooltip(commit.message)}
      icon={GitCommitHorizontalIcon}
      primary={commit.title}
      secondary={
        <>
          <span className="min-w-0 truncate">{commit.author_name}</span>
          <span className="shrink-0">
            · {relativeTime(commit.committed_at)}
          </span>
          {showProject && (
            <span className="min-w-0 truncate">· {commit.project_path}</span>
          )}
        </>
      }
      aside={<span className={SHA}>{shortSha(commit.sha)}</span>}
    />
  );
}
