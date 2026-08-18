/**
 * The role matrix, as pure functions. No React, no network.
 *
 * **One module, so a rule lives in one place.** The plan is explicit about the
 * failure this prevents: `role === "admin"` comparisons scattered through
 * components drift, and the one that drifts is the one nobody re-reads. Every
 * gate in the UI derives from here.
 *
 * **This is UX and never enforcement.** Every capability below is already
 * enforced in the database — M3-05's policies for content, M3-14's rank
 * arithmetic for membership, M3-15's triggers for the Owner, M3-17 for board
 * settings. Bypassing the UI entirely changes nothing about what is allowed.
 * What this buys is honesty: a viewer who can press a button that always fails
 * reads the board as broken rather than as read-only.
 *
 * The hierarchy mirrors `public.board_role_rank(text)` deliberately, and the
 * mirroring is the point — `canActOnMember` is the client's copy of the
 * strictly-below-own-rank rule the membership RPCs apply, so the controls the
 * UI offers are exactly the calls that will succeed.
 */

export const BOARD_ROLES = ["viewer", "editor", "admin", "owner"] as const;

export type BoardRole = (typeof BOARD_ROLES)[number];

/** viewer 1 < editor 2 < admin 3 < owner 4. The single definition. */
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

/**
 * Rank of a role, or `null` for a non-member and for anything unrecognised.
 *
 * Null rather than 0, and every caller tests for it explicitly rather than
 * letting it flow into a comparison — the same care `board_role_rank` records,
 * for the same reason: a nullish rank in a `<=` is the shape that turns a deny
 * into an allow.
 */
export function roleRank(role: string | null | undefined): number | null {
  return isBoardRole(role) ? RANK[role] : null;
}

export interface Permissions {
  /** The caller's own role on this board, or null if they are not a member. */
  role: BoardRole | null;
  canReadBoard: boolean;
  canEditTodos: boolean;
  canManageColumns: boolean;
  canManageMembers: boolean;
  canManageAdmins: boolean;
  canDeleteBoard: boolean;
  /**
   * May post a comment (M7-01).
   *
   * **Identical to `canReadBoard` today, and named separately on purpose.**
   * "May a viewer comment?" was carried as an open decision until M7-01
   * answered it — commenting is participation, not content — and a rule that
   * hard-won should be findable by name rather than inferred from an alias.
   */
  canComment: boolean;
  /**
   * May delete somebody else's comment (M7-01).
   *
   * Moderation, and the only power anyone has over a comment they did not
   * write. Editing another person's text is nobody's, at any rank.
   */
  canModerateComments: boolean;
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
};

/**
 * What a role may do, from the matrices in Part II of the implementation plan.
 *
 * Each line names the database rule it mirrors, so a divergence is findable:
 *
 *   canReadBoard      any membership          M3-04 / M3-05 SELECT policies
 *   canEditTodos      editor and above        M3-05 write policies
 *   canManageColumns  editor and above        M3-05 — columns are content, not
 *                                             board settings, which are M3-17's
 *                                             admin-and-above
 *   canManageMembers  admin and above         M3-14 add/set/remove
 *   canManageAdmins   owner only              M3-14 — an admin may not mint or
 *                                             touch another admin
 *   canDeleteBoard    owner only              M2-01's DELETE policy, left
 *                                             owner-only when M3-17 widened
 *                                             UPDATE to admins
 */
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
  };
}

/**
 * Whether the actor may edit this comment.
 *
 * **The author, and nobody else — there is no rank that widens this.** An admin
 * who could rewrite someone's words would make the attribution a lie, which is
 * a different and worse thing than removing them. The database says the same:
 * M7-01's UPDATE policy is `author_id = auth.uid()` with no role branch, and
 * the grant narrows it further to the `content` column alone.
 *
 * Takes ids rather than a role, because rank is genuinely irrelevant here.
 * A missing `userId` — the session still resolving — is not the author.
 */
export function canEditComment(
  userId: string | null | undefined,
  authorId: string,
): boolean {
  return Boolean(userId) && userId === authorId;
}

/**
 * Whether the actor may delete this comment.
 *
 * The client's copy of M7-01's DELETE policy, in the same order: an admin or
 * owner reaches any comment on their board, and everyone else reaches only
 * their own. The membership test on the second branch is what stops a stale
 * `userId` from a signed-out session matching an author id.
 */
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

/**
 * Whether the actor may change or remove this member.
 *
 * The client's copy of the one rule M3-14 states: AN ACTOR MAY ONLY ACT ON A
 * MEMBER STRICTLY BELOW THEIR OWN RANK, AND NEVER ON THE OWNER.
 *
 * The Owner is refused **before** the rank comparison, exactly as the RPCs
 * order their guards — so the Owner stays untouchable even if the arithmetic
 * below were wrong. That also covers the owner acting on themselves: a board
 * has exactly one Owner and no control targets them, including their own.
 *
 * Strictly-below falls out of one comparison and covers three separate rules
 * without a branch each: an admin cannot touch another admin, an admin cannot
 * touch themselves through the management path, and nobody can act at or above
 * their own rank.
 */
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

/**
 * The roles the actor may assign, in hierarchy order.
 *
 * **`owner` is never in this list, for anybody.** Ownership is not grantable
 * through membership management (invariant I6) — there is no transfer
 * operation, and `add_board_member` / `set_member_role` reject the role
 * outright. An owner assigns viewer, editor or admin; an admin assigns viewer
 * or editor; everyone else assigns nothing.
 */
export function assignableRoles(
  actorRole: string | null | undefined,
): BoardRole[] {
  const actor = roleRank(actorRole);

  if (actor === null || actor < RANK.admin) return [];

  return BOARD_ROLES.filter((role) => role !== "owner" && RANK[role] < actor);
}
