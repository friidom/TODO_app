import { useTranslation } from "react-i18next";
import { useDeferredValue, useState } from "react";
import { Loader2, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import { AdminEmpty, AdminSkeleton } from "@/components/admin/AdminTable";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
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

const nameOf = (account: Pick<AdminAccount, "username" | "email">) =>
  account.username ?? account.email;

export default function AdminAccessPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const { data, error, isFetching } = useAdminAccounts(query);
  const [pending, setPending] = useState<Pending | null>(null);

  // Every /admin endpoint answers 404 to a caller without the role, so a 404
  // here means it was taken away while this page was open.
  const lost = error instanceof ApiError && error.status === 404;

  const ask = (account: AdminAccount) =>
    setPending({
      account,
      action: roleActionFor(account, data?.active_superadmins ?? 0),
    });

  return (
    <AdminShell
      title={t("admin.sections.access")}
      hint={t("admin.access.hint")}
      showPeriod={false}
      busy={isFetching}
    >
      {lost ? (
        <AdminEmpty>
          {t("admin.access.lost")}{" "}
          <Link to="/" className="text-brand">
            {t("admin.backToBoards")}
          </Link>
        </AdminEmpty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SummaryCard
            title={t("admin.access.accounts")}
            hint={t("admin.access.accountsHint")}
          >
            <label className="border-hairline bg-elevated rounded-control focus-within:border-brand mx-3.5 mb-2 flex h-8 items-center gap-2 border px-2.5 transition-colors">
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

            {error ? (
              <WidgetEmpty>{t("admin.loadFailedRetry")}</WidgetEmpty>
            ) : !data ? (
              <AdminSkeleton rows={6} />
            ) : data.accounts.length === 0 ? (
              <WidgetEmpty>
                {query.trim()
                  ? t("admin.access.noMatch", { query: query.trim() })
                  : t("admin.access.noAccounts")}
              </WidgetEmpty>
            ) : (
              <ul className="flex flex-col">
                {data.accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    action={roleActionFor(account, data.active_superadmins)}
                    onAct={() => ask(account)}
                  />
                ))}
              </ul>
            )}
          </SummaryCard>

          <div className="flex min-w-0 flex-col gap-4">
            <SignedInAs />

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
              {!data ? (
                <AdminSkeleton rows={2} />
              ) : (
                <ul className="flex flex-col">
                  {data.superadmins.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      action={roleActionFor(account, data.active_superadmins)}
                      onAct={() => ask(account)}
                      compact
                    />
                  ))}
                </ul>
              )}
            </SummaryCard>

            <RoleHistory />
          </div>
        </div>
      )}

      {pending && (
        <RoleDialog pending={pending} onClose={() => setPending(null)} />
      )}
    </AdminShell>
  );
}

function SignedInAs() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <SummaryCard title={t("admin.access.you")}>
      <div className="flex items-start gap-3 px-3.5 pb-3.5">
        <ShieldCheckIcon className="text-brand mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-ink text-meta truncate font-medium">
            {user.profile?.username ?? user.email}
          </p>
          <p className="text-ink-3 text-mini truncate">{user.email}</p>
          <p className="text-ink-3 text-mini mt-2 leading-relaxed">
            {t("admin.access.youHint")}
          </p>
        </div>
      </div>
    </SummaryCard>
  );
}

function AccountRow({
  account,
  action,
  onAct,
  compact = false,
}: {
  account: AdminAccount;
  action: RoleAction;
  onAct: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const self = account.id === user?.id;

  return (
    <li className="border-hairline flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3.5 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-ink text-meta truncate font-medium">
          {nameOf(account)}
          {self && (
            <span className="text-ink-3 font-normal">
              {" "}
              · {t("admin.access.youLabel")}
            </span>
          )}
        </p>
        <p className="text-ink-3 text-mini truncate">{account.email}</p>
      </div>

      {!compact && <StatusChip status={account.status} />}
      {!compact && account.org_role === "superadmin" && <SuperadminChip />}

      {!compact && (
        <span
          className="text-ink-3 text-mini w-20 shrink-0 tabular-nums"
          title={account.created_at}
        >
          {relativeTime(account.created_at)}
        </span>
      )}

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
          "rounded-control text-mini h-7 shrink-0 border px-2.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          action.kind === "grant"
            ? "border-brand/30 text-brand hover:bg-brand/10"
            : "border-status-red/30 text-status-red hover:bg-status-red/10",
        )}
      >
        {action.kind === "grant"
          ? t("admin.access.grant")
          : t("admin.access.revoke")}
      </button>

      {action.blocked === "last" && (
        <p className="text-ink-3 text-mini basis-full">
          {t("admin.access.blocked.last")}
        </p>
      )}
    </li>
  );
}

const STATUS_TONE = {
  active: "bg-status-green/12 text-status-green",
  unverified: "bg-status-orange/12 text-status-orange",
  deactivated: "bg-ink/[0.06] text-ink-3",
} as const;

function StatusChip({ status }: { status: AdminAccount["status"] }) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "text-micro w-24 shrink-0 rounded px-1.5 py-0.5 text-center font-semibold tracking-wide uppercase",
        STATUS_TONE[status],
      )}
    >
      {t(`admin.access.status.${status}`)}
    </span>
  );
}

function SuperadminChip() {
  const { t } = useTranslation();

  return (
    <span className="bg-brand/12 text-brand text-micro shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase">
      {t("sidebar.superadmin")}
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

  return (
    <SummaryCard
      title={t("admin.access.history")}
      hint={t("admin.access.historyHint")}
    >
      {error ? (
        <WidgetEmpty>{t("admin.loadFailed")}</WidgetEmpty>
      ) : !data ? (
        <AdminSkeleton rows={3} />
      ) : data.entries.length === 0 ? (
        <WidgetEmpty>{t("admin.access.historyEmpty")}</WidgetEmpty>
      ) : (
        <ul className="flex flex-col">
          {data.entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </SummaryCard>
  );
}

function HistoryRow({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation();
  const outcome = roleAuditOutcome(entry.action);
  const payload = (entry.payload ?? {}) as { reason?: string };

  const actor =
    entry.actor_id === SYSTEM_ACTOR_ID
      ? t("admin.access.systemActor")
      : (entry.actor_username ?? t("admin.removedAccount"));
  const target = entry.target_username ?? t("admin.removedAccount");

  return (
    <li className="border-hairline flex flex-col gap-0.5 border-b px-3.5 py-2 last:border-b-0">
      <p className="text-ink-2 text-meta">
        <span className="text-ink font-medium">{actor}</span>{" "}
        {t(`admin.access.historyAction.${outcome ?? "other"}`)}{" "}
        <span className="text-ink font-medium">{target}</span>
      </p>
      <p className="text-ink-3 text-mini">
        {outcome === "refused" && payload.reason
          ? `${t(`admin.access.refusal.${payload.reason}`, { defaultValue: payload.reason })} · `
          : ""}
        <span title={entry.created_at}>{relativeTime(entry.created_at)}</span>
      </p>
    </li>
  );
}
