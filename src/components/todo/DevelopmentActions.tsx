import { useTranslation } from "react-i18next";
import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { FloatingPortal } from "@floating-ui/react";
import {
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitCommitVerticalIcon,
  SettingsIcon,
  SquareTerminalIcon,
  type LucideIcon,
} from "lucide-react";

import DetailCard from "./DetailCard";
import { useCardPopover } from "./TodoItem/useCardPopover";
import { INLINE_ACTION_BRAND, TEXT_FIELD } from "./detailChrome";
import IconButton from "@/components/ui/IconButton";
import { MENU_ITEM, POPOVER_PANEL } from "@/components/ui/controlChrome";
import { usePermissions } from "@/hooks/usePermissions";
import { boardSettingsPath } from "@/services/boardSettings/registry";
import {
  branchName,
  commitCommand,
  developmentCount,
  editorUrl,
  newBranchUrl,
} from "@/services/gitlab/development";
import type { DevelopmentProject } from "@/services/gitlab/gitlabApi";
import { useDevelopment } from "@/services/gitlab/useDevelopment";
import { toast } from "@/stores/toasts";
import type { TodoDetail } from "@/types/data";
import { cn } from "@/utils/cn";

const ACTION = cn(
  INLINE_ACTION_BRAND,
  "text-meta aria-expanded:bg-brand-soft flex w-full items-center gap-2 px-2 py-1.5 text-left [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
);

// Waits on DevelopmentSection's query rather than showing its own skeleton or
// error: that section already renders both for the same request.
export default function DevelopmentActions({
  todo,
  taskKey,
}: {
  todo: TodoDetail;
  taskKey: string | null;
}) {
  const { t } = useTranslation();
  const { canEditBoard, canEditTodos } = usePermissions();
  const { data } = useDevelopment(todo.board_id, todo.id);

  if (!data) return null;

  const develops = canEditTodos && data.projects.length > 0;

  if (!canEditBoard && !develops) return null;

  return (
    <DetailCard
      id="development"
      title={t("development.title")}
      count={developmentCount(data) || undefined}
    >
      <div className="space-y-0.5 p-1.5">
        {canEditBoard && (
          <Link
            to={boardSettingsPath(todo.board_id, "integrations")}
            className={ACTION}
          >
            <SettingsIcon />
            <span className="min-w-0 truncate">
              {t("development.connectTools")}
            </span>
          </Link>
        )}

        {develops && (
          <>
            <OpenInEditor projects={data.projects} />
            <CreateBranch
              todo={todo}
              taskKey={taskKey}
              projects={data.projects}
            />
            <CreateCommit title={todo.title} taskKey={taskKey} />
          </>
        )}
      </div>
    </DetailCard>
  );
}

function OpenInEditor({ projects }: { projects: DevelopmentProject[] }) {
  const { t } = useTranslation();
  const label = t("development.openInEditor");

  if (projects.length === 1) {
    const [project] = projects;

    return (
      <a
        href={editorUrl(project.project_url)}
        title={t("development.openInEditorHint", {
          project: project.project_path,
        })}
        className={ACTION}
      >
        <SquareTerminalIcon />
        <span className="min-w-0 truncate">{label}</span>
      </a>
    );
  }

  return (
    <Dropdown icon={SquareTerminalIcon} label={label}>
      <ul className="-m-2">
        {projects.map((project, index) => (
          <li key={project.project_url}>
            <a
              href={editorUrl(project.project_url)}
              title={t("development.openInEditorHint", {
                project: project.project_path,
              })}
              autoFocus={index === 0}
              className={MENU_ITEM}
            >
              <SquareTerminalIcon />
              <span className="min-w-0 truncate">{project.project_path}</span>
            </a>
          </li>
        ))}
      </ul>
    </Dropdown>
  );
}

function CreateBranch({
  todo,
  taskKey,
  projects,
}: {
  todo: TodoDetail;
  taskKey: string | null;
  projects: DevelopmentProject[];
}) {
  const { t } = useTranslation();
  const branch =
    taskKey === null ? null : branchName(taskKey, todo.title, todo.type);

  return (
    <Dropdown
      icon={GitBranchIcon}
      label={t("development.createBranch")}
      disabled={branch === null}
    >
      {branch !== null && (
        <>
          <CopyField
            label={t("development.branchName")}
            value={branch}
            autoFocus
          />

          <CopyField
            label={t("development.checkoutCommand")}
            value={`git checkout -b ${branch}`}
          />

          <ul className="border-hairline -mx-3 -mb-2 border-t px-1 pt-1">
            {projects.map((project) => (
              <li key={project.project_url}>
                <a
                  href={newBranchUrl(project.project_url, branch)}
                  target="_blank"
                  rel="noreferrer"
                  className={MENU_ITEM}
                >
                  <ExternalLinkIcon />
                  <span className="min-w-0 flex-1 truncate">
                    {t("development.createInGitLab")}
                  </span>
                  {projects.length > 1 && (
                    <span className="text-ink-3 max-w-[50%] truncate text-xs">
                      {project.project_path}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dropdown>
  );
}

function CreateCommit({
  title,
  taskKey,
}: {
  title: string | null;
  taskKey: string | null;
}) {
  const { t } = useTranslation();

  return (
    <Dropdown
      icon={GitCommitVerticalIcon}
      label={t("development.createCommit")}
      disabled={taskKey === null}
    >
      {taskKey !== null && (
        <>
          <div>
            <p className="text-ink text-meta font-semibold">
              {t("development.commitTitle")}
            </p>
            <p className="text-ink-2 mt-1 text-xs leading-relaxed">
              {t("development.hint", { key: taskKey })}
            </p>
          </div>

          <CopyField
            label={t("development.copyKey")}
            value={taskKey}
            autoFocus
          />

          <CopyField
            label={t("development.copyCommit")}
            value={commitCommand(taskKey, title)}
          />
        </>
      )}
    </Dropdown>
  );
}

function Dropdown({
  icon: Icon,
  label,
  disabled = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { mounted, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-start",
  });

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        {...triggerProps}
        className={ACTION}
      >
        <Icon />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDownIcon className="size-3.5" />
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={label}
            className={cn(
              POPOVER_PANEL,
              "z-50 w-80 max-w-[calc(100vw-1rem)] space-y-3 p-3",
            )}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function CopyField({
  label,
  value,
  autoFocus = false,
}: {
  label: string;
  value: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("development.copied"));
    } catch {
      toast.error(t("development.copyFailed"));
    }
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="text-ink-2 text-mini mb-1 block font-medium"
      >
        {label}
      </label>

      <div className="flex gap-1.5">
        <input
          id={id}
          readOnly
          value={value}
          autoFocus={autoFocus}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(
            TEXT_FIELD,
            "rounded-control h-8 min-w-0 flex-1 px-2 font-mono text-xs",
          )}
        />

        <IconButton
          label={t("gitlab.copy")}
          size="md"
          onClick={() => void copy()}
          className="border-hairline bg-surface border"
        >
          <CopyIcon />
        </IconButton>
      </div>
    </div>
  );
}
