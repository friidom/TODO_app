// The role matrix, and the authority for it. src/services/members/permissions.ts
// is the UI's mirror of this file; a shared JSON fixture keeps the two honest
// (permissions.parity.test.ts in both packages).
//
// Kept as a table rather than a series of ifs so that a rule is read, not
// reconstructed. Rank alone cannot express the author-specific rules below —
// those are called from the service layer, never from requireRole.
import type { Actor } from "../types/actor.js";

export const BOARD_ROLES = ["viewer", "editor", "admin", "owner"] as const;

export type BoardRole = (typeof BOARD_ROLES)[number];

const RANK: Record<BoardRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export function isBoardRole(value: unknown): value is BoardRole {
  return (
    typeof value === "string" &&
    (BOARD_ROLES as readonly string[]).includes(value)
  );
}

// null (not 0) for non-member/unrecognised, so callers must test it rather than let it flow into a comparison.
export function roleRank(role: string | null | undefined): number | null {
  return isBoardRole(role) ? RANK[role] : null;
}

export interface Permissions {
  role: BoardRole | null;
  canReadBoard: boolean;
  canEditTodos: boolean;
  canManageColumns: boolean;
  canManageMembers: boolean;
  canManageAdmins: boolean;
  canDeleteBoard: boolean;
  canComment: boolean;
  canModerateComments: boolean;
  // Content matrix, not canComment's — a viewer may comment but not attach (M32).
  canAttach: boolean;
}

export const NO_PERMISSIONS: Permissions = {
  role: null,
  canReadBoard: false,
  canEditTodos: false,
  canManageColumns: false,
  canManageMembers: false,
  canManageAdmins: false,
  canDeleteBoard: false,
  canComment: false,
  canModerateComments: false,
  canAttach: false,
};

export function permissionsFor(role: string | null | undefined): Permissions {
  const rank = roleRank(role);

  if (rank === null) return NO_PERMISSIONS;

  return {
    role: role as BoardRole,
    canReadBoard: true,
    canEditTodos: rank >= RANK.editor,
    canManageColumns: rank >= RANK.editor,
    canManageMembers: rank >= RANK.admin,
    canManageAdmins: rank >= RANK.owner,
    canDeleteBoard: rank >= RANK.owner,
    canComment: true,
    canModerateComments: rank >= RANK.admin,
    canAttach: rank >= RANK.editor,
  };
}

// The author only, no rank widens this — rewriting someone's words isn't moderation.
export function canEditComment(
  userId: string | null | undefined,
  authorId: string,
): boolean {
  return Boolean(userId) && userId === authorId;
}

export function canDeleteComment(
  actorRole: string | null | undefined,
  userId: string | null | undefined,
  authorId: string,
): boolean {
  const actor = roleRank(actorRole);

  if (actor === null) return false;
  if (actor >= RANK.admin) return true;

  return canEditComment(userId, authorId);
}

// uploaderId is nullable (uploader_id is on delete set null) — an orphaned file only a moderator can remove.
export function canDeleteAttachment(
  actorRole: string | null | undefined,
  userId: string | null | undefined,
  uploaderId: string | null,
): boolean {
  const actor = roleRank(actorRole);

  if (actor === null) return false;
  if (actor >= RANK.admin) return true;
  if (!userId || !uploaderId) return false;

  return actor >= RANK.editor && userId === uploaderId;
}

// Owner refused before the rank check, so it stays untouchable regardless of arithmetic.
export function canActOnMember(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  if (targetRole === "owner") return false;

  const actor = roleRank(actorRole);
  const target = roleRank(targetRole);

  if (actor === null || target === null) return false;
  if (actor < RANK.admin) return false;

  return actor > target;
}

// owner is never assignable — there's no transfer operation.
export function assignableRoles(
  actorRole: string | null | undefined,
): BoardRole[] {
  const actor = roleRank(actorRole);

  if (actor === null || actor < RANK.admin) return [];

  return BOARD_ROLES.filter((role) => role !== "owner" && RANK[role] < actor);
}

// Beside the board matrix, never inside it. §10.7 rule 1 is that an elevated
// role widens *read* and never *write*, and the way that rule stays true is
// that no rank comparison above can ever see an org role: there is no rank at
// which a superadmin outranks a board's owner, because they are answering
// different questions. A superadmin who is not a member of a board still gets
// 404 from boardAccess and 403 from requireRole, exactly as before.
//
// Deliberately not mirrored into src/services/members/permissions.ts, and so
// deliberately absent from permissions-matrix.json: the frontend does not hold
// a copy of the org role's rules, it reads one field about itself off
// /auth/me. A mirror would be a second place for this to be wrong.
export function isSuperadmin(actor: Actor | undefined): boolean {
  return actor?.orgRole === "superadmin";
}
