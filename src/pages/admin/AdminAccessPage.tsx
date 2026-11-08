import { useTranslation } from "react-i18next";
import { useDeferredValue, useState } from "react";
import {
  CheckIcon,
  Loader2,
  MinusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
import { AdminEmpty } from "@/components/admin/AdminTable";
import RoleChip from "@/components/admin/RoleChip";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import {
  SYSTEM_ACTOR_ID,
  roleActionFor,
  roleAuditOutcome,
  roleOutcomeKey,
  type RoleAction,
} from "@/services/admin/access";
import {
  useAdminAccounts,
  useAdminRoleAudit,
  useSaveSuperadmin,
} from "@/services/admin/useAdmin";
import type { AdminAccount, AuditEntry } from "@/services/admin/types";
import { ApiError } from "@/services/api/client";
import { fetchMe } from "@/services/auth/authApi";
import { setSessionUser } from "@/services/auth/session";
import { useAuth } from "@/services/auth/useAuth";
import { toast } from "@/stores/toasts";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

interface Pending {
  account: AdminAccount;
  action: RoleAction;
}

// The server's default page of /admin/accounts; past it, search finds the rest.
const ACCOUNTS_SHOWN = 50;
const HISTORY_SHOWN = 5;
// The newest few until asked: granting is rare, and search finds anyone.
const CANDIDATES_SHOWN = 8;

const nameOf = (account: Pick<AdminAccount, "username" | "email">) =>
  account.username ?? account.email;

export default function AdminAccessPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const { data, error } = useAdminAccounts(query);
  const [pending, setPending] = useState<Pending | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Every /admin endpoint answers 404 to a caller without the role, so a 404
  // here means it was taken away while this page was open.
  const lost = error instanceof ApiError && error.status === 404;

  const ask = (account: AdminAccount) =>
    setPending({
      account,
      action: roleActionFor(account, data?.active_superadmins ?? 0),
    });

  // Superadmins have their own list above; this one is who could join it.
  const candidates = (data?.accounts ?? []).filter(
    (account) => account.org_role !== "superadmin",
  );
  const searching = query.trim() !== "";
  const shown =
    searching || expanded ? candidates : candidates.slice(0, CANDIDATES_SHOWN);
  const lastStanding = data?.superadmins.some(
    (account) =>
      roleActionFor(account, data.active_superadmins).blocked === "last",
  );

  return (
    <AdminPage
      title={t("admin.sections.access")}
      description={t("admin.access.hint")}
    >
      {lost ? (
        <AdminEmpty>
          {t("admin.access.lost")}{" "}
          <Link to="/" className="text-brand">
            {t("admin.backToBoards")}
          </Link>
        </AdminEmpty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <SummaryCard
              title={t("admin.access.superadmins")}
              hint={
                data
                  ? t("admin.access.activeCount", {
                      count: data.active_superadmins,
                    })
                  : undefined
              }
            >
              {error ? (
                <WidgetEmpty>{t("admin.loadFailedRetry")}</WidgetEmpty>
              ) : !data ? (
                <RowsSkeleton rows={2} />
              ) : (
                <ul className="border-hairline divide-hairline divide-y border-t">
                  {data.superadmins.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      action={roleActionFor(account, data.active_superadmins)}
                      onAct={() => ask(account)}
                    />
                  ))}
                </ul>
              )}

              {lastStanding && (
                <p className="border-hairline text-ink-3 text-mini border-t px-3.5 py-2.5">
                  {t("admin.access.blocked.last")}
                </p>
              )}
            </SummaryCard>

            <SummaryCard
              title={t("admin.access.add")}
              hint={t("admin.access.addHint")}
            >
              <div className="px-3.5 pb-3">
                <label className="border-hairline bg-elevated rounded-control focus-within:border-brand focus-within:ring-brand/30 flex h-8 items-center gap-2 border px-2.5 transition-colors focus-within:ring-2">
                  <SearchIcon className="text-ink-3 size-3.5 shrink-0" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("admin.access.searchPlaceholder")}
                    aria-label={t("admin.access.searchPlaceholder")}
                    className="text-ink placeholder:text-ink-3 text-meta min-w-0 flex-1 bg-transparent outline-none"
                  />
                </label>
              </div>

              {error ? (
                <WidgetEmpty>{t("admin.loadFailedRetry")}</WidgetEmpty>
              ) : !data ? (
                <RowsSkeleton rows={6} />
              ) : candidates.length === 0 ? (
                <WidgetEmpty>
                  {query.trim()
                    ? t("admin.access.noGrantMatch", { query: query.trim() })
                    : t("admin.access.noAccounts")}
                </WidgetEmpty>
              ) : (
                <ul className="border-hairline divide-hairline divide-y border-t">
                  {shown.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      action={roleActionFor(account, data.active_superadmins)}
                      onAct={() => ask(account)}
                    />
                  ))}
                </ul>
              )}

              {data && shown.length < candidates.length && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="border-hairline text-ink-2 hover:text-ink hover:bg-wash text-mini focus-visible:ring-brand rounded-b-card w-full border-t px-3.5 py-2.5 text-left font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
                >
                  {t("admin.access.showAll", { count: candidates.length })}
                </button>
              )}

              {data &&
                !searching &&
                shown.length === candidates.length &&
                data.accounts.length >= ACCOUNTS_SHOWN && (
                  <p className="border-hairline text-ink-3 text-mini border-t px-3.5 py-2.5">
                    {t("admin.access.capped", { count: ACCOUNTS_SHOWN })}
                  </p>
                )}
            </SummaryCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SignedInAs />
            <RoleScope />
            <RoleHistory />
          </div>
        </div>
      )}

      {pending && (
        <RoleDialog pending={pending} onClose={() => setPending(null)} />
      )}
    </AdminPage>
  );
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border-hairline divide-hairline divide-y border-t">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3.5 py-3">
          <span className="skeleton size-7 shrink-0 rounded-full" />
          <span className="skeleton h-3 w-40 rounded" />
        </div>
      ))}
    </div>
  );
}

function AccountAvatar({ account }: { account: AdminAccount }) {
  return (
    <Avatar size="sm" className="shrink-0">
      <AvatarImage src={account.avatar_url ?? undefined} alt="" />
      <AvatarFallback className="bg-elevated text-ink-2 text-micro font-semibold">
        {nameOf(account).charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function SignedInAs() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <SummaryCard title={t("admin.access.you")}>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm" className="shrink-0">
            <AvatarImage src={user.profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-elevated text-ink-2 text-micro font-semibold">
              {(user.profile?.username ?? user.email).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="text-ink text-meta flex items-center gap-1.5 font-medium">
              <span className="truncate">
                {user.profile?.username ?? user.email}
              </span>
              <RoleChip />
            </p>
            <p className="text-ink-3 text-mini truncate">{user.email}</p>
          </div>
        </div>

        <p className="text-ink-3 text-mini leading-relaxed">
          {t("admin.access.youHint")}
        </p>
      </div>
    </SummaryCard>
  );
}

// What a grant does and does not do, stated before anyone is asked to confirm
// one. It restates the server's rules; it decides nothing.
function RoleScope() {
  const { t } = useTranslation();

  const lines = [
    { key: "analytics", allowed: true },
    { key: "manage", allowed: true },
    { key: "boards", allowed: false },
  ] as const;

  return (
    <SummaryCard title={t("admin.access.scope.title")}>
      <ul className="flex flex-col gap-2 px-3.5 pb-3">
        {lines.map((line) => {
          const Icon = line.allowed ? CheckIcon : MinusIcon;

          return (
            <li key={line.key} className="flex items-start gap-2">
              <Icon
                aria-hidden
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  line.allowed ? "text-status-green" : "text-ink-3",
                )}
              />
              <span className="text-ink-2 text-mini leading-relaxed">
                {t(`admin.access.scope.${line.key}`)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="border-hairline text-ink-3 text-mini flex items-start gap-2 border-t px-3.5 py-2.5 leading-relaxed">
        <ShieldCheckIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t("admin.access.scope.audited")}
      </p>
    </SummaryCard>
  );
}

function AccountRow({
  account,
  action,
  onAct,
}: {
  account: AdminAccount;
  action: RoleAction;
  onAct: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const self = account.id === user?.id;
  const grant = action.kind === "grant";

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_7.5rem_auto]">
      <AccountAvatar account={account} />

      <div className="min-w-0">
        <p className="text-meta flex min-w-0 items-center gap-1.5">
          <span
            className="text-ink truncate font-medium"
            title={nameOf(account)}
          >
            {nameOf(account)}
          </span>
          {self && (
            <span className="text-ink-3 shrink-0">
              · {t("admin.access.youLabel")}
            </span>
          )}
          {account.status !== "active" && (
            <StatusChip status={account.status} />
          )}
        </p>
        <p className="text-ink-3 text-mini truncate" title={account.email}>
          {account.email}
        </p>
      </div>

      <span
        className="text-ink-3 text-mini hidden tabular-nums sm:block"
        title={account.created_at}
      >
        {t("admin.access.joined", { when: relativeTime(account.created_at) })}
      </span>

      <button
        type="button"
        onClick={onAct}
        disabled={action.blocked !== null}
        title={
          action.blocked
            ? t(`admin.access.blocked.${action.blocked}`)
            : undefined
        }
        className={cn(
          "rounded-control text-mini focus-visible:ring-brand h-7 shrink-0 border px-2.5 font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45",
          grant
            ? "border-hairline text-ink-2 hover:text-ink hover:bg-wash enabled:hover:border-ink/20"
            : "border-status-red/25 text-status-red enabled:hover:bg-status-red/10",
        )}
      >
        {grant ? t("admin.access.grant") : t("admin.access.revoke")}
      </button>
    </li>
  );
}

const STATUS_TONE = {
  active: "text-status-green",
  unverified: "text-status-orange",
  deactivated: "text-ink-3",
} as const;

function StatusChip({ status }: { status: AdminAccount["status"] }) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "text-mini flex shrink-0 items-center gap-1",
        STATUS_TONE[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {t(`admin.access.status.${status}`)}
    </span>
  );
}

function RoleDialog({
  pending,
  onClose,
}: {
  pending: Pending;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const save = useSaveSuperadmin();
  const { account, action } = pending;
  const grant = action.kind === "grant";
  const self = account.id === user?.id;
  const name = nameOf(account);

  const confirm = () =>
    save.mutate(
      { id: account.id, superadmin: grant },
      {
        onSuccess: ({ outcome }) => {
          toast.success(t(roleOutcomeKey(outcome, self), { name }));
          onClose();

          // The route guard reads the session's own role; refresh it so this
          // area closes now rather than on the next reload.
          if (self && outcome === "revoked") {
            void fetchMe()
              .then(setSessionUser)
              .catch(() => navigate("/"));
          }
        },
      },
    );

  return (
    <Modal
      title={grant ? t("admin.access.grant") : t("admin.access.revoke")}
      onClose={onClose}
      width="w-[460px]"
    >
      <h2 className={DIALOG_TITLE}>
        {grant
          ? t("admin.access.grantTitle", { name })
          : t("admin.access.revokeTitle", { name })}
      </h2>

      <p className={`${DIALOG_BODY} mt-2`}>
        {grant ? t("admin.access.grantBody") : t("admin.access.revokeBody")}
      </p>

      {self && !grant && (
        <p className={`${DIALOG_BODY} text-status-red mt-2 font-medium`}>
          {t("admin.access.revokeSelfWarning")}
        </p>
      )}

      {save.error && (
        <p role="alert" className={DIALOG_ERROR}>
          {save.error.message}
        </p>
      )}

      <div className={DIALOG_ACTIONS}>
        <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
          {t("common.cancel")}
        </button>

        <button
          type="button"
          onClick={confirm}
          disabled={save.isPending}
          className={grant ? DIALOG_CONFIRM : DIALOG_DANGER}
        >
          {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {grant
            ? t("admin.access.grantConfirm")
            : t("admin.access.revokeConfirm")}
        </button>
      </div>
    </Modal>
  );
}

function RoleHistory() {
  const { t } = useTranslation();
  const { data, error } = useAdminRoleAudit();

  const entries = (data?.entries ?? []).slice(0, HISTORY_SHOWN);

  return (
    <SummaryCard
      title={t("admin.access.historyRecent")}
      action={
        <Link
          to="/admin/audit?type=roles"
          className="text-ink-3 hover:text-brand text-mini transition-colors"
        >
          {t("admin.auditLog.viewAll")}
        </Link>
      }
    >
      {error ? (
        <WidgetEmpty>{t("admin.loadFailed")}</WidgetEmpty>
      ) : !data ? (
        <RowsSkeleton rows={3} />
      ) : entries.length === 0 ? (
        <WidgetEmpty>{t("admin.access.historyEmpty")}</WidgetEmpty>
      ) : (
        <ul className="border-hairline divide-hairline divide-y border-t">
          {entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </SummaryCard>
  );
}

const OUTCOME_TONE = {
  granted: "bg-status-green",
  revoked: "bg-ink-3",
  refused: "bg-status-orange",
  other: "bg-ink-3",
} as const;

function HistoryRow({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation();
  const outcome = roleAuditOutcome(entry.action) ?? "other";
  const payload = (entry.payload ?? {}) as { reason?: string };

  const actor =
    entry.actor_id === SYSTEM_ACTOR_ID
      ? t("admin.access.systemActor")
      : (entry.actor_username ?? t("admin.removedAccount"));
  const target = entry.target_username ?? t("admin.removedAccount");

  return (
    <li className="flex gap-2.5 px-3.5 py-2">
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full",
          OUTCOME_TONE[outcome],
        )}
      />
      <div className="min-w-0">
        <p className="text-ink-2 text-mini leading-relaxed">
          <span className="text-ink font-medium">{actor}</span>{" "}
          {t(`admin.access.historyAction.${outcome}`)}{" "}
          <span className="text-ink font-medium">{target}</span>
        </p>
        <p className="text-ink-3 text-micro">
          {outcome === "refused" && payload.reason
            ? `${t(`admin.access.refusal.${payload.reason}`, { defaultValue: payload.reason })} · `
            : ""}
          <span title={entry.created_at}>{relativeTime(entry.created_at)}</span>
        </p>
      </div>
    </li>
  );
}
