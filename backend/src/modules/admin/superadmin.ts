// The superadmin role's transition rules, pure so the matrix is tested without
// a database. admin.repo.ts applies the verdict inside the transaction that
// locked the rows it was decided on.

// The audit actor for the bootstrap CLI. Nobody is signed in at a shell, and
// admin_audit_log.actor_id is not null, so the operator is recorded as the
// system rather than as the account being promoted.
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

export type RoleChangeVia = "admin_panel" | "bootstrap_cli";

export type RefusalReason =
  | "deactivated"
  | "unverified"
  | "last_superadmin"
  | "superadmin_exists";

export interface RoleTarget {
  org_role: string;
  email_verified_at: Date | null;
  deactivated_at: Date | null;
}

export type RoleVerdict =
  | { kind: "apply"; from: string; to: "superadmin" | "member" }
  | { kind: "unchanged" }
  | { kind: "refuse"; reason: RefusalReason };

export function decideSuperadmin(input: {
  grant: boolean;
  target: RoleTarget;
  // Active ones only: a deactivated superadmin already has no access.
  activeSuperadmins: number;
  // The CLI may only create the first one; after that, the panel decides.
  bootstrap: boolean;
}): RoleVerdict {
  const { grant, target, activeSuperadmins, bootstrap } = input;
  const isSuperadmin = target.org_role === "superadmin";

  if (grant) {
    if (isSuperadmin) return { kind: "unchanged" };
    if (target.deactivated_at !== null) return { kind: "refuse", reason: "deactivated" };
    // An unconfirmed address is not yet proven to be the person it names.
    if (target.email_verified_at === null) return { kind: "refuse", reason: "unverified" };
    if (bootstrap && activeSuperadmins > 0) return { kind: "refuse", reason: "superadmin_exists" };

    return { kind: "apply", from: target.org_role, to: "superadmin" };
  }

  if (!isSuperadmin) return { kind: "unchanged" };

  // Revoking a deactivated superadmin leaves the active count where it was.
  if (target.deactivated_at === null && activeSuperadmins <= 1) {
    return { kind: "refuse", reason: "last_superadmin" };
  }

  return { kind: "apply", from: target.org_role, to: "member" };
}

export const REFUSAL_MESSAGES: Record<RefusalReason, string> = {
  deactivated: "This account is deactivated.",
  unverified: "Only an account with a confirmed email can be given global admin access.",
  last_superadmin: "This is the last superadmin. Give the role to someone else first.",
  superadmin_exists: "A superadmin already exists. Grant further roles from the admin panel.",
};
