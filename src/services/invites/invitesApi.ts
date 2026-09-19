import { api, toQuery } from "../api/client";

// owner isn't here — ownership isn't grantable by invite link.
export const INVITE_ROLES = ["viewer", "editor", "admin"] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

export type BoardInvite = {
  id: string;
  board_id: string;
  email: string | null;
  role: string;
  expires_at: string;
  created_by: string | null;
  accepted_at: string | null;
  created_at: string;
};

// The plaintext token comes back once, here, and is unrecoverable afterwards —
// only its hash is stored.
export type CreatedInvite = BoardInvite & { token: string };

// Every rule lives server-side — the role ceiling, the expiry clamp, the token.
export function createInvite({
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
  return api.post<CreatedInvite>(`/boards/${boardId}/invites`, {
    role,
    expires_in_days: expiresInDays,
    email,
  });
}

export function fetchPendingInvites(boardId: string): Promise<BoardInvite[]> {
  return api.get<BoardInvite[]>(`/boards/${boardId}/invites`);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await api.del<void>(`/invites/${inviteId}`);
}

export type AcceptedInvite = {
  status: "accepted" | "already_member";
  board_id: string;
};

// One of the two, never both: a link carries a token, the inbox carries an id
// whose addressee the API checks against the caller's own address.
export type InviteCredential = { token: string } | { invite_id: string };

// The credential travels in the body rather than the path, because an access
// log records URLs and an invite token is a bearer credential.
export function acceptInvite(credential: InviteCredential): Promise<AcceptedInvite> {
  return api.post<AcceptedInvite>("/invites/accept", credential);
}

export type Invitee = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
};

// Under two characters the API returns nothing — no walking the user table with a half-typed query.
export function searchInvitees(boardId: string, query: string): Promise<Invitee[]> {
  return api.get<Invitee[]>(`/boards/${boardId}/invitees${toQuery({ q: query })}`);
}

export type MyInvite = {
  id: string;
  role: string;
  expires_at: string;
  board_id: string;
  board_title: string | null;
};

// Not revokeInvite — this is the invitee declining, that one's the inviter withdrawing and needs admin.
export async function declineInvite(credential: InviteCredential): Promise<boolean> {
  await api.post<void>("/invites/decline", credential);

  return true;
}

// No arguments — the address comes from the caller's own session, so nobody can list invites for someone else.
export function fetchMyInvites(): Promise<MyInvite[]> {
  return api.get<MyInvite[]>("/invites/mine");
}
