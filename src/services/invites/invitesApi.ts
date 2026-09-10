import { supabase } from "../api/supabase";
import type { Database } from "@/types/database";

// owner isn't here — ownership isn't grantable by invite link.
export const INVITE_ROLES = ["viewer", "editor", "admin"] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

export type BoardInvite = Database["public"]["Tables"]["board_invites"]["Row"];

export type CreatedInvite =
  Database["public"]["Functions"]["create_invite"]["Returns"][number];

// Every rule lives in the RPC — role ceiling, expiry clamp, token minting. The token comes from Postgres, not the browser.
export async function createInvite({
  boardId,
  role,
  expiresInDays,
  email = null,
}: {
  boardId: string;
  role: InviteRole;
  expiresInDays: number;
  email?: string | null;
}): Promise<CreatedInvite> {
  const { data, error } = await supabase.rpc("create_invite", {
    p_board_id: boardId,
    p_role: role,
    p_expires_in_days: expiresInDays,
    // omitted, not null — the RPC's own default only kicks in when the param is absent
    ...(email ? { p_email: email } : {}),
  });

  if (error) throw error;

  const invite = data?.[0];

  if (!invite) throw new Error("The invitation could not be created.");

  return invite;
}

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

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_invite", {
    p_invite_id: inviteId,
  });

  if (error) throw error;
}

export type AcceptedInvite = {
  status: "accepted" | "already_member";
  board_id: string;
};

// The token is the only argument — the client can't name a board or pick its own role.
export async function acceptInvite(token: string): Promise<AcceptedInvite> {
  const { data, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  });

  if (error) throw error;

  const result = data?.[0];

  if (!result) throw new Error("The invitation could not be accepted.");

  return {
    status: result.status === "accepted" ? "accepted" : "already_member",
    board_id: result.board_id,
  };
}

export type Invitee =
  Database["public"]["Functions"]["search_board_invitees"]["Returns"][number];

// Under two characters the RPC returns nothing — no walking the user table with a half-typed query.
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

export type MyInvite =
  Database["public"]["Functions"]["my_pending_invites"]["Returns"][number];

// Not revokeInvite — this is the invitee declining, that one's the inviter withdrawing and needs admin.
export async function declineInvite(token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("decline_invite", {
    p_token: token,
  });

  if (error) throw error;

  return data ?? false;
}

// No arguments — the address comes from the caller's own session inside the RPC, so nobody can list invites for someone else.
export async function fetchMyInvites(): Promise<MyInvite[]> {
  const { data, error } = await supabase.rpc("my_pending_invites");

  if (error) throw error;

  return data ?? [];
}
