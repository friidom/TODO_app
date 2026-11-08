import type { AuthUser } from "@/services/auth/session";
import type { AccountStatus, RoleOutcome } from "./types";

// Every role-change audit action starts with this; the API filters on it.
export const ROLE_AUDIT_ACTIONS = "user.superadmin";

// The admin area's front door. Defence in depth only: requireSuperadmin reads
// the role on every /admin request and answers 404 whatever this says.
export function canEnterAdmin(user: AuthUser | null): boolean {
  return user?.org_role === "superadmin";
}

export type RoleBlock = "unverified" | "deactivated" | "last";

export interface RoleAction {
  kind: "grant" | "revoke";
  // Why the button is disabled, mirroring the server's refusals so the page
  // explains one before it is asked for. The server still decides.
  blocked: RoleBlock | null;
}

export function roleActionFor(
  account: { org_role: string; status: AccountStatus },
  activeSuperadmins: number,
): RoleAction {
  if (account.org_role === "superadmin") {
    const last = account.status !== "deactivated" && activeSuperadmins <= 1;

    return { kind: "revoke", blocked: last ? "last" : null };
  }

  if (account.status === "deactivated") {
    return { kind: "grant", blocked: "deactivated" };
  }

  if (account.status === "unverified") {
    return { kind: "grant", blocked: "unverified" };
  }

  return { kind: "grant", blocked: null };
}

// The toast after a change. "unchanged" is said out loud: a second click from
// another tab is a success, and silence would read as a failure.
export function roleOutcomeKey(outcome: RoleOutcome, self: boolean): string {
  if (outcome === "revoked" && self) return "admin.access.toast.revokedSelf";

  return `admin.access.toast.${outcome}`;
}

export type RoleAuditOutcome = "granted" | "revoked" | "refused";

export function roleAuditOutcome(action: string): RoleAuditOutcome | null {
  if (action === "user.superadmin_granted") return "granted";
  if (action === "user.superadmin_revoked") return "revoked";
  if (action === "user.superadmin_refused") return "refused";

  return null;
}

// The bootstrap CLI's audit actor: nobody is signed in at a shell.
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
