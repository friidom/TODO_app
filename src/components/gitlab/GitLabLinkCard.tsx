import { useTranslation } from "react-i18next";
import { useId, useState, type ReactNode } from "react";
import {
  CopyIcon,
  ExternalLinkIcon,
  Link2OffIcon,
  Loader2,
} from "lucide-react";

import { Field } from "@/components/boardSettings/BoardSettingsShell";
import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import type {
  GitLabLink,
  GitLabLinkStatus,
  GitLabOwner,
} from "@/services/gitlab/gitlabApi";
import {
  LINK_STATUS_LABEL,
  displayStatus,
  failureMessageKey,
  signingTokenProblem,
  type GitLabDisplayStatus,
  type SigningTokenProblem,
} from "@/services/gitlab/gitlabLinks";
import {
  useDisconnectGitLab,
  useSaveGitLabSigningToken,
} from "@/services/gitlab/useGitLabLinkMutations";
import { toast } from "@/stores/toasts";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

export const ACTION =
  "border-hairline text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control text-meta flex h-9 shrink-0 items-center gap-2 border px-3 font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

const DANGER =
  "border-status-red/30 text-status-red hover:bg-status-red/10 focus-visible:ring-status-red rounded-control text-meta flex h-9 shrink-0 items-center gap-2 border px-3 font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export const SUBMIT =
  "bg-brand text-brand-fg rounded-control inline-flex h-9 items-center gap-2 px-3.5 text-[13px] font-medium transition-opacity disabled:opacity-60";

const STATUS_TONE: Record<GitLabDisplayStatus, string> = {
  server_setup:
    "border-status-orange/30 bg-status-orange/10 text-status-orange",
  awaiting_token:
    "border-status-orange/30 bg-status-orange/10 text-status-orange",
  awaiting_delivery: "border-status-blue/30 bg-status-blue/10 text-status-blue",
  active: "border-status-green/30 bg-status-green/10 text-status-green",
  failing: "border-status-red/30 bg-status-red/10 text-status-red",
};

const TOKEN_PROBLEM: Record<SigningTokenProblem, string> = {
  required: "gitlab.tokenProblem.required",
  prefix: "gitlab.tokenProblem.prefix",
};

const SETUP_STEPS = [
  "gitlab.setup.open",
  "gitlab.setup.url",
  "gitlab.setup.trigger",
  "gitlab.setup.token",
  "gitlab.setup.save",
] as const;

export function StatusBadge({
  status,
  configured,
}: {
  status: GitLabLinkStatus;
  configured: boolean;
}) {
  const { t } = useTranslation();
  const shown = displayStatus(status, configured);

  return (
    <span
      className={cn(
        "text-mini rounded-full border px-2 py-0.5 font-medium whitespace-nowrap",
        STATUS_TONE[shown],
      )}
    >
      {t(LINK_STATUS_LABEL[shown])}
    </span>
  );
}

// Name first, then where it lives: the namespace and GitLab's own address.
export function ProjectName({ path, url }: { path: string; url: string }) {
  const { t } = useTranslation();
  const slash = path.lastIndexOf("/");

  return (
    <div className="min-w-0">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={t("gitlab.openProject", { project: path })}
        className="text-ink hover:text-brand flex min-w-0 items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <span className="truncate">{path.slice(slash + 1)}</span>
        <ExternalLinkIcon className="text-ink-3 size-3.5 shrink-0" />
      </a>

      <p className="text-ink-3 truncate text-xs">
        {path.slice(0, slash)} · {url.replace(/^https:\/\//, "")}
      </p>
    </div>
  );
}

export default function GitLabLinkCard({
  link,
  owner,
  configured,
  disconnectMessage,
  actions,
  note,
}: {
  link: GitLabLink;
  owner: GitLabOwner;
  configured: boolean;
  disconnectMessage: string;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="border-hairline rounded-control border">
      <header className="border-hairline flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <ProjectName path={link.project_path} url={link.project_url} />

        <StatusBadge status={link.status} configured={configured} />

        <div className="ml-auto flex items-center gap-2">
          {actions}

          <button
            type="button"
            disabled={confirming}
            onClick={() => setConfirming(true)}
            className={cn(DANGER, "h-8")}
          >
            <Link2OffIcon className="size-3.5" />
            {t("gitlab.disconnect")}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {note}

        {confirming && (
          <DisconnectConfirm
            owner={owner}
            linkId={link.id}
            message={disconnectMessage}
            onCancel={() => setConfirming(false)}
          />
        )}

        <StatusLine link={link} configured={configured} />

        <WebhookUrl url={link.webhook_url} />

        {/* until the server can store a token, steps ending in "paste the token" would end in a refusal */}
        {configured && link.status !== "active" && (
          <SetupSteps project={link.project_path} />
        )}

        {configured && <SigningTokenForm owner={owner} link={link} />}
      </div>
    </article>
  );
}

function StatusLine({
  link,
  configured,
}: {
  link: GitLabLink;
  configured: boolean;
}) {
  const { t } = useTranslation();

  if (!configured) {
    return (
      <p className="text-ink-2 text-xs">
        {t("gitlab.statusDetail.serverSetup")}
      </p>
    );
  }

  if (link.status === "failing") {
    return (
      <p
        role="status"
        className="border-status-red/30 bg-status-red/10 text-status-red rounded-control border px-3 py-2 text-xs"
      >
        {t(failureMessageKey(link.last_failure_reason))}{" "}
        {t("gitlab.statusDetail.failing", {
          time: relativeTime(link.last_failure_at) ?? "",
        })}
      </p>
    );
  }

  const detail = {
    awaiting_token: () => t("gitlab.statusDetail.awaitingToken"),
    awaiting_delivery: () => t("gitlab.statusDetail.awaitingDelivery"),
    active: () =>
      t("gitlab.statusDetail.active", {
        time: relativeTime(link.last_delivery_at) ?? "",
      }),
  }[link.status];

  return <p className="text-ink-2 text-xs">{detail()}</p>;
}

function WebhookUrl({ url }: { url: string }) {
  const { t } = useTranslation();
  const id = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("gitlab.copied"));
    } catch {
      toast.error(t("gitlab.copyFailed"));
    }
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="text-ink-2 text-meta mb-1.5 block font-medium"
      >
        {t("gitlab.webhookUrl")}
      </label>

      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(FIELD_INPUT, "min-w-0 font-mono text-xs")}
        />

        <button type="button" onClick={() => void copy()} className={ACTION}>
          <CopyIcon className="size-3.5" />
          {t("gitlab.copy")}
        </button>
      </div>
    </div>
  );
}

function SetupSteps({ project }: { project: string }) {
  const { t } = useTranslation();

  return (
    <div>
      <p className="text-ink-2 text-meta mb-1.5 font-medium">
        {t("gitlab.setupTitle")}
      </p>

      <ol className="text-ink-2 flex list-decimal flex-col gap-1 pl-5 text-xs leading-relaxed">
        {SETUP_STEPS.map((step) => (
          <li key={step}>{t(step, { project })}</li>
        ))}
      </ol>
    </div>
  );
}

function SigningTokenForm({
  owner,
  link,
}: {
  owner: GitLabOwner;
  link: GitLabLink;
}) {
  const { t } = useTranslation();
  const save = useSaveGitLabSigningToken(owner);
  const [token, setToken] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const problem = submitted ? signingTokenProblem(token) : undefined;
  const savedAt = relativeTime(link.signing_token_set_at);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    if (signingTokenProblem(token) !== undefined) return;

    save.mutate(
      { linkId: link.id, token: token.trim() },
      {
        onSuccess: () => {
          setToken("");
          setSubmitted(false);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Field
        label={t("gitlab.signingToken")}
        hint={
          savedAt
            ? t("gitlab.tokenSavedAt", { time: savedAt })
            : t("gitlab.signingTokenHint")
        }
      >
        <input
          type="password"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            save.reset();
          }}
          placeholder="whsec_…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={problem !== undefined}
          className={cn(
            FIELD_INPUT,
            "font-mono",
            problem && FIELD_INPUT_INVALID,
          )}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {problem ? (
          <p role="alert" className="text-status-red mr-auto text-xs">
            {t(TOKEN_PROBLEM[problem])}
          </p>
        ) : save.isError ? (
          <p role="alert" className="text-status-red mr-auto text-xs">
            {save.error.message}
          </p>
        ) : save.isSuccess ? (
          <p className="text-ink-3 mr-auto text-xs">{t("common.saved")}</p>
        ) : null}

        <button type="submit" disabled={save.isPending} className={SUBMIT}>
          {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {save.isPending
            ? t("common.saving")
            : link.signing_token_set_at
              ? t("gitlab.replaceToken")
              : t("gitlab.saveToken")}
        </button>
      </div>
    </form>
  );
}

function DisconnectConfirm({
  owner,
  linkId,
  message,
  onCancel,
}: {
  owner: GitLabOwner;
  linkId: string;
  message: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const disconnect = useDisconnectGitLab(owner);

  return (
    <div
      className="border-status-red/30 bg-status-red/5 rounded-control flex flex-col gap-3 border p-3"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        onCancel();
      }}
    >
      <p className="text-ink-2 text-xs leading-relaxed">{message}</p>

      {disconnect.isError && (
        <p role="alert" className="text-status-red text-xs">
          {disconnect.error.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          disabled={disconnect.isPending}
          onClick={onCancel}
          className={ACTION}
        >
          {t("common.cancel")}
        </button>

        <button
          type="button"
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate({ linkId })}
          className={DANGER}
        >
          {disconnect.isPending && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          {disconnect.isPending
            ? t("gitlab.disconnecting")
            : t("gitlab.disconnect")}
        </button>
      </div>
    </div>
  );
}
