import { useTranslation } from "react-i18next";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { actionLabel } from "@/services/admin/format";
import { useAdminAudit } from "@/services/admin/useAdmin";
import { relativeTime } from "@/utils/relativeTime";

const SHOWN = 12;

export default function AuditLog() {
  const { t } = useTranslation();
  const { data, error } = useAdminAudit();

  const entries = (data?.entries ?? []).slice(0, SHOWN);

  return (
    <SummaryCard title={t("admin.audit.title")} hint={t("admin.audit.hint")}>
      {error ? (
        <WidgetEmpty>{t("admin.loadFailed")}</WidgetEmpty>
      ) : entries.length === 0 ? (
        <WidgetEmpty>{t("admin.audit.empty")}</WidgetEmpty>
      ) : (
        <ul className="flex flex-col">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-hairline flex items-baseline gap-2 border-b px-3.5 py-2 last:border-b-0"
            >
              <span className="text-ink text-meta min-w-0 flex-1 truncate">
                <span className="font-medium">
                  {entry.actor_username ?? t("admin.removedAccount")}
                </span>{" "}
                <span className="text-ink-2">{actionLabel(entry.action)}</span>
                {entry.target_id && (
                  <span className="text-ink-3"> · {entry.target_id}</span>
                )}
              </span>

              <span
                className="text-ink-3 text-mini shrink-0"
                title={entry.created_at}
              >
                {relativeTime(entry.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SummaryCard>
  );
}
