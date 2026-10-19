import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import {
  ScrollTextIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TargetIcon,
  UserCogIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";

import AdminPage from "@/components/admin/AdminPage";
import Segmented from "@/components/admin/Segmented";
import { AdminEmpty, AdminSkeleton } from "@/components/admin/AdminTable";
import EmptyState from "@/components/ui/EmptyState";
import { groupActivitiesByDay } from "@/services/activities/activityGroups";
import {
  AUDIT_FILTER_PREFIX,
  AUDIT_FILTERS,
  auditActor,
  auditChange,
  auditKind,
  auditTarget,
  isAuditFilter,
  type AuditFilter,
  type AuditKind,
} from "@/services/admin/audit";
import { actionLabel, adminLocale } from "@/services/admin/format";
import type { AuditEntry } from "@/services/admin/types";
import { useAdminAudit } from "@/services/admin/useAdmin";
import { cn } from "@/utils/cn";

// The API's own page size for /admin/audit: a full page means there may be more.
const AUDIT_PAGE = 200;

const COLUMNS =
  "minmax(11rem,1.3fr) minmax(7rem,1fr) minmax(11rem,1.7fr) minmax(7rem,1fr) 3.5rem";

const KIND_ICON: Record<AuditKind, LucideIcon> = {
  roles: ShieldCheckIcon,
  seniority: UserCogIcon,
  kpi: TargetIcon,
  workflow: WorkflowIcon,
};

export default function AdminAuditPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const requested = params.get("type");
  const filter: AuditFilter = isAuditFilter(requested) ? requested : "all";
  const { data, error } = useAdminAudit(AUDIT_FILTER_PREFIX[filter]);

  const setFilter = (next: AuditFilter) =>
    setParams(next === "all" ? {} : { type: next }, { replace: true });

  const entries = data?.entries ?? [];
  const days = groupActivitiesByDay(entries, new Date(), adminLocale());

  return (
    <AdminPage
      title={t("admin.sections.audit")}
      description={t("admin.auditLog.description")}
      toolbar={
        <Segmented
          label={t("admin.auditLog.filterLabel")}
          value={filter}
          onChange={setFilter}
          options={AUDIT_FILTERS.map((value) => ({
            value,
            label: t(`admin.auditLog.filters.${value}`),
          }))}
        />
      }
    >
      {error ? (
        <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : entries.length === 0 ? (
        <div className="border-hairline bg-surface rounded-card border">
          <EmptyState
            icon={ScrollTextIcon}
            title={t("admin.auditLog.empty.title")}
            hint={t(`admin.auditLog.empty.${filter}`)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-ink-3 text-mini">
            {entries.length >= AUDIT_PAGE
              ? t("admin.auditLog.capped", { count: entries.length })
              : t("admin.auditLog.complete", { count: entries.length })}
          </p>

          <div
            role="table"
            aria-label={t("admin.sections.audit")}
            className="border-hairline bg-surface rounded-card overflow-hidden border"
            style={{ ["--audit-cols" as string]: COLUMNS }}
          >
            <div
              role="row"
              className="bg-wash border-hairline text-ink-3 text-mini hidden grid-cols-(--audit-cols) gap-3 border-b px-3.5 py-1.5 font-medium sm:grid"
            >
              <span role="columnheader">{t("admin.columns.action")}</span>
              <span role="columnheader">{t("admin.auditLog.target")}</span>
              <span role="columnheader">{t("admin.auditLog.change")}</span>
              <span role="columnheader">{t("admin.auditLog.actor")}</span>
              <span role="columnheader" className="text-right">
                {t("admin.auditLog.time")}
              </span>
            </div>

            {days.map((day) => (
              <div key={day.key} role="rowgroup">
                <div
                  role="row"
                  className="border-hairline text-ink-2 text-mini flex items-baseline gap-2 border-b px-3.5 pt-3 pb-1.5 font-medium"
                >
                  <span role="cell">{day.label}</span>
                  <span className="text-ink-3 font-normal tabular-nums">
                    {day.items.length}
                  </span>
                </div>

                {day.items.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminPage>
  );
}

// One grid at every width: on a phone the target and change share a line under
// the action, and the actor drops below them, instead of scrolling sideways.
function AuditRow({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation();
  const target = auditTarget(entry);
  const change = auditChange(entry);
  const kind = auditKind(entry.action);
  const refused = entry.action.endsWith("_refused");
  const Icon = refused
    ? ShieldAlertIcon
    : kind
      ? KIND_ICON[kind]
      : ScrollTextIcon;
  const at = new Date(entry.created_at);

  return (
    <div
      role="row"
      className="border-hairline hover:bg-wash text-meta grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b px-3.5 py-2 transition-colors last:border-b-0 sm:min-h-11 sm:grid-cols-(--audit-cols) sm:items-center"
    >
      <span
        role="cell"
        className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 sm:col-auto sm:row-auto"
      >
        <span
          className={cn(
            "bg-wash grid size-6 shrink-0 place-items-center rounded-md",
            refused ? "text-status-orange" : "text-ink-3",
          )}
        >
          <Icon aria-hidden className="size-3.5" />
        </span>
        <span className="text-ink truncate font-medium">
          {actionLabel(entry.action)}
        </span>
      </span>

      <span className="text-mini col-span-2 row-start-2 min-w-0 truncate pl-8 sm:contents">
        <span role="cell" className="sm:text-meta min-w-0 truncate">
          {target?.to ? (
            <Link
              to={target.to}
              className="text-ink hover:text-brand underline-offset-2 transition-colors hover:underline"
            >
              {target.label}
            </Link>
          ) : (
            <span className="text-ink-2">{target?.label ?? "—"}</span>
          )}
        </span>
        <span aria-hidden className="text-ink-3 sm:hidden">
          {" · "}
        </span>
        <span role="cell" className="text-ink-2 sm:text-meta min-w-0 truncate">
          {change || "—"}
        </span>
      </span>

      <span
        role="cell"
        className="text-mini sm:text-meta col-span-2 row-start-3 min-w-0 truncate pl-8 sm:col-auto sm:row-auto sm:pl-0"
      >
        <span className="text-ink-3 sm:hidden">
          {t("admin.auditLog.byLine", { name: auditActor(entry) })}
        </span>
        <span className="text-ink-2 hidden sm:inline">{auditActor(entry)}</span>
      </span>

      <span
        role="cell"
        className="text-ink-3 text-mini col-start-2 row-start-1 text-right tabular-nums sm:col-auto sm:row-auto"
        title={at.toLocaleString(adminLocale())}
      >
        {Number.isNaN(at.getTime())
          ? "—"
          : at.toLocaleTimeString(adminLocale(), {
              hour: "2-digit",
              minute: "2-digit",
            })}
      </span>
    </div>
  );
}
