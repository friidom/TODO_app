import i18n from "@/components/i18n";
import { SYSTEM_ACTOR_ID } from "./access";
import type { AuditEntry } from "./types";

export const AUDIT_FILTERS = [
  "all",
  "roles",
  "seniority",
  "kpi",
  "workflow",
] as const;

export type AuditFilter = (typeof AUDIT_FILTERS)[number];

// What /admin/audit filters by: a prefix of the action name. Backticks on the
// board one, because locales.test.ts reads a quoted "board.…" as a i18n key.
export const AUDIT_FILTER_PREFIX: Record<AuditFilter, string | undefined> = {
  all: undefined,
  roles: "user.superadmin",
  seniority: "user.seniority",
  kpi: "kpi_target",
  workflow: `board.workflow`,
};

export function isAuditFilter(value: unknown): value is AuditFilter {
  return AUDIT_FILTERS.includes(value as AuditFilter);
}

export type AuditKind = Exclude<AuditFilter, "all">;

// Which filter an entry falls under, so a row can carry its kind's icon.
export function auditKind(action: string): AuditKind | null {
  for (const filter of AUDIT_FILTERS) {
    const prefix = AUDIT_FILTER_PREFIX[filter];

    if (filter !== "all" && prefix && action.startsWith(prefix)) return filter;
  }

  return null;
}

export function auditActor(entry: AuditEntry): string {
  if (entry.actor_id === SYSTEM_ACTOR_ID) {
    return i18n.t("admin.access.systemActor");
  }

  return entry.actor_username ?? i18n.t("admin.removedAccount");
}

export interface AuditTarget {
  label: string;
  to?: string;
}

export function auditTarget(entry: AuditEntry): AuditTarget | null {
  if (entry.target_id === null) return null;

  switch (entry.target_type) {
    case "user":
      return entry.target_username === null
        ? { label: i18n.t("admin.removedAccount") }
        : {
            label: entry.target_username,
            to: `/admin/users/${entry.target_id}`,
          };
    case "board":
      return {
        label: i18n.t("sidebar.board"),
        to: `/admin/boards/${entry.target_id}`,
      };
    case "kpi_target":
      return { label: seniorityLabel(entry.target_id) };
    default:
      return { label: entry.target_id };
  }
}

// The change in words, read from the payload each action writes in
// backend/src/modules/admin (admin.service.ts and changeSuperadmin).
export function auditChange(entry: AuditEntry): string {
  const payload = (entry.payload ?? {}) as Record<string, unknown>;

  switch (entry.action) {
    case "user.superadmin_granted":
    case "user.superadmin_revoked": {
      const change = `${roleLabel(payload.from)} → ${roleLabel(payload.to)}`;

      return payload.via === "bootstrap_cli"
        ? `${change} · ${i18n.t("admin.auditLog.viaBootstrap")}`
        : change;
    }
    case "user.superadmin_refused":
      return i18n.t(`admin.access.refusal.${String(payload.reason)}`, {
        defaultValue: String(payload.reason ?? ""),
      });
    case "user.seniority_changed":
      return seniorityLabel(payload.seniority);
    case "kpi_target.updated":
      return i18n.t("admin.auditLog.kpiChange", {
        daily: payload.daily_points,
        weekly: payload.weekly_points,
      });
    case "board.workflow_published":
      return i18n.t("admin.auditLog.workflowChange", {
        from: payload.from_version,
        to: payload.to_version,
      });
    default:
      return "";
  }
}

function roleLabel(role: unknown): string {
  if (role === "superadmin") return i18n.t("sidebar.superadmin");
  if (role === "member") return i18n.t("admin.auditLog.member");
  if (typeof role !== "string") return "—";

  // team_lead and director are reserved and have no label of their own yet.
  const words = role.replace(/_/g, " ");

  return words.charAt(0).toUpperCase() + words.slice(1);
}

function seniorityLabel(seniority: unknown): string {
  if (typeof seniority !== "string") return i18n.t("admin.auditLog.noLevel");

  return i18n.t(`admin.seniority.${seniority}`, { defaultValue: seniority });
}
