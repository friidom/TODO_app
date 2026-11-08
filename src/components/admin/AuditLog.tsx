import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { auditActor, auditChange, auditTarget } from "@/services/admin/audit";
import { actionLabel } from "@/services/admin/format";
import { useAdminAudit } from "@/services/admin/useAdmin";
import { relativeTime } from "@/utils/relativeTime";

const SHOWN = 6;

export default function AuditLog({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data, error } = useAdminAudit();

  const entries = (data?.entries ?? []).slice(0, SHOWN);

  return (
    <SummaryCard
      title={t("admin.audit.title")}
      hint={t("admin.audit.hint")}
      className={className}
      action={
        <Link
          to="/admin/audit"
          className="text-ink-3 hover:text-brand text-mini transition-colors"
        >
          {t("admin.auditLog.viewAll")}
        </Link>
      }
    >
      {error ? (
        <WidgetEmpty>{t("admin.loadFailed")}</WidgetEmpty>
      ) : !data ? (
        <div className="flex flex-col gap-2 px-3.5 pb-3.5">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="skeleton h-4 rounded" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <WidgetEmpty>{t("admin.audit.empty")}</WidgetEmpty>
      ) : (
        <ul className="border-hairline divide-hairline flex flex-col divide-y border-t">
          {entries.map((entry) => {
            const target = auditTarget(entry);
            const change = auditChange(entry);
            const detail = [target?.label, change].filter(Boolean).join(" · ");

            return (
              <li key={entry.id} className="flex flex-col gap-0.5 px-3.5 py-2">
                <p className="text-meta flex items-baseline gap-2">
                  <span className="text-ink-2 min-w-0 flex-1 truncate">
                    <span className="text-ink font-medium">
                      {auditActor(entry)}
                    </span>{" "}
                    {actionLabel(entry.action)}
                  </span>
                  <span
                    className="text-ink-3 text-mini shrink-0 tabular-nums"
                    title={entry.created_at}
                  >
                    {relativeTime(entry.created_at)}
                  </span>
                </p>

                {detail && (
                  <p className="text-ink-3 text-mini truncate">{detail}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SummaryCard>
  );
}
