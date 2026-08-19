import { supabase } from "../api/supabase";
import type { Database } from "@/types/database";

/**
 * The roles an invitation can carry.
 *
 * Derived from nothing — it is written out because it is a fixed set the
 * database checks at the column level (`board_invites.role`), and `owner` is
 * deliberately absent. Ownership is not grantable by link (invariant I6), so
 * there is no code path in the client that can even express it.
 */
export const INVITE_ROLES = ["viewer", "editor", "admin"] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

/** A pending invitation, as the board's owner or admin sees it. */
export type BoardInvite = Database["public"]["Tables"]["board_invites"]["Row"];

/**
 * What `create_invite` hands back — four fields, not the row.
 *
 * The RPC's `returns table (…)` list is the exposure boundary, the same way
 * `board_roster`'s is, so `board_id`, `created_by` and `email` are absent
 * because the caller either already knows them or has no use for them.
 *
 * Derived from the generated type rather than hand-written. `membersApi.ts`
 * narrows `board_roster`'s row by hand because a `TABLE` signature carries no
 * nullability and three of its columns really are nullable in `profiles` — the
 * generated type is wrong there. Here all four columns are non-null in
 * `board_invites`, so the generator's answer is the correct one and restating
 * it would be a second copy to keep in step.
 */
export type CreatedInvite =
  Database["public"]["Functions"]["create_invite"]["Returns"][number];

/**
 * Mints an invite link.
 *
 * Every rule lives in the RPC: the caller must be an owner or admin, and may
 * only invite at a role strictly below their own — so an admin asking for
 * `admin` is refused server-side even though the UI does not offer it. The
 * token is generated in Postgres, never here; a token minted in React is a
 * credential minted by whoever is holding the browser.
 *
 * `expiresInDays` is a request, not an instruction: the RPC clamps it to
 * 1..30.
 */
export async function createInvite({
  boardId,
  role,
  expiresInDays,
  email = null,
}: {
  boardId: string;
  role: InviteRole;
  expiresInDays: number;
  /**
   * Who the invitation is for (M4-08 stage 1).
   *
   * `null` is the link invite this function shipped with, and it takes the
   * identical path through the RPC — the addressee block is skipped entirely.
   * A non-null address must belong to a registered profile; that is the one
   * rule stage 2 relaxes.
   */
  email?: string | null;
}): Promise<CreatedInvite> {
  const { data, error } = await supabase.rpc("create_invite", {
    p_board_id: boardId,
    p_role: role,
    p_expires_in_days: expiresInDays,
    // Omitted rather than passed as null. The generated signature types this
    // as an optional `string` — Supabase's generator cannot express a nullable
    // text parameter — and omitting it lets the RPC's own `default null` apply,
    // which is exactly the link-invite path.
    ...(email ? { p_email: email } : {}),
  });

  if (error) throw error;

  // `returns table` always arrives as an array. One row, or the RPC raised.
  const invite = data?.[0];

  if (!invite) throw new Error("The invitation could not be created.");

  return invite;
}

/**
 * The board's pending invitations.
 *
 * A direct table read rather than an RPC, which M4-01's SELECT policy
 * sanctions: `board_role(board_id) in ('owner','admin')`. A viewer or editor
 * running this gets an empty array rather than an error, so an empty list is a
 * legitimate state and not a failure to report.
 *
 * The three filters are M4-07. Accepted invites are history and expired ones
 * are unusable, so neither belongs in a list whose only actions are "copy" and
 * "revoke". Expiry is filtered here rather than swept by a scheduler — a row
 * nobody can use and nobody can see is not worth a cron job. The client clock
 * decides what is hidden, which is harmless: `accept_invite` is what actually
 * enforces expiry, and it reads the server's.
 */
export async function fetchPendingInvites(
  boardId: string,
): Promise<BoardInvite[]> {
  const { data, error } = await supabase
    .from("board_invites")
    .select("*")
    .eq("board_id", boardId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data ?? [];
}

/**
 * Withdraws a pending invitation.
 *
 * The RPC deletes the row, so the link stops working immediately and fails
 * exactly as an unknown token does. It refuses an invite that has already been
 * accepted — that row is the audit trail, and removing the person it admitted
 * is `remove_board_member`'s job.
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_invite", {
    p_invite_id: inviteId,
  });

  if (error) throw error;
}

/** Both ways `accept_invite` can succeed. */
export type AcceptedInvite = {
  status: "accepted" | "already_member";
  board_id: string;
};

/**
 * Redeems a token.
 *
 * The token is the only argument, which is the whole security story: the
 * client cannot name a board, cannot accept on someone else's behalf, and
 * cannot choose the role it receives. Everything the membership is made of
 * comes off the stored invite row.
 *
 * `status` is a discriminant rather than a boolean because the two successes
 * mean different things to the UI — `accepted` created a membership,
 * `already_member` changed nothing at all.
 */
export async function acceptInvite(token: string): Promise<AcceptedInvite> {
  const { data, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  });

  if (error) throw error;

  const result = data?.[0];

  if (!result) throw new Error("The invitation could not be accepted.");

  // The RPC only ever returns these two, but the generated type says `string`
  // — `returns table` carries no enum information any more than it carries
  // nullability.
  return {
    status: result.status === "accepted" ? "accepted" : "already_member",
    board_id: result.board_id,
  };
}

/**
 * One row of the invite autocomplete (M4-08).
 *
 * Five columns, and the RPC's `returns table (…)` list is the exposure
 * boundary exactly as `board_roster`'s is. `bio`, `created_at` and every future
 * profile column stay on the far side of it.
 */
export type Invitee =
  Database["public"]["Functions"]["search_board_invitees"]["Returns"][number];

/**
 * Registered users who could still be invited to this board.
 *
 * The filtering — not yourself, not already a member, not already holding a
 * live invitation — is the RPC's, not the caller's. Doing it here would mean
 * shipping the full profile list to the client and hiding rows in React, which
 * is not hiding them at all.
 *
 * Under two characters the RPC returns nothing rather than everything, so a
 * half-typed query cannot be used to walk the user table.
 */
export async function searchInvitees(
  boardId: string,
  query: string,
): Promise<Invitee[]> {
  const { data, error } = await supabase.rpc("search_board_invitees", {
    p_board_id: boardId,
    p_query: query,
  });

  if (error) throw error;

  return data ?? [];
}

/** A live invitation addressed to the signed-in user. */
export type MyInvite =
  Database["public"]["Functions"]["my_pending_invites"]["Returns"][number];

/**
 * Invitations waiting for the current user.
 *
 * This exists because stage 1 sends no email: an addressed invitation would
 * otherwise be visible to everyone except the person it is for. It takes no
 * argument on purpose — the address is read from the caller's own profile
 * inside the RPC, so nobody can list invitations sent to somebody else.
 */
export async function fetchMyInvites(): Promise<MyInvite[]> {
  const { data, error } = await supabase.rpc("my_pending_invites");

  if (error) throw error;

  return data ?? [];
}
