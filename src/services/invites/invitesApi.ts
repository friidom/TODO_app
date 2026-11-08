import { api, toQuery } from "../api/client";

// owner isn't here — ownership isn't grantable by invite link.
export const INVITE_ROLES = ["viewer", "editor", "admin"] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

export type BoardInvite = {
  id: string;
  board_id: string;
  // set on a space invitation, which grants several boards with one credential
  space_id: string | null;
  email: string | null;
  role: string;
  expires_at: string;
  created_by: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type InviteBoard = { id: string; title: string | null; key: string };

// A board's pending list includes the space invitations that list it.
export type PendingInvite = BoardInvite & {
  space_title: string | null;
  board_count: number;
};

export type SpaceInvite = BoardInvite & { boards: InviteBoard[] };

// What an invitation is for: one board, or the boards of a space the caller owns.
export type InviteScope =
  { kind: "board"; boardId: string } | { kind: "space"; spaceId: string };

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

export function fetchPendingInvites(boardId: string): Promise<PendingInvite[]> {
  return api.get<PendingInvite[]>(`/boards/${boardId}/invites`);
}

// Fixed when sent: a board filed into the space later is not included.
export function createSpaceInvite({
  spaceId,
  boardIds,
  role,
  expiresInDays,
  email = null,
}: {
  spaceId: string;
  boardIds: string[];
  role: InviteRole;
  expiresInDays: number;
  email?: string | null;
}): Promise<CreatedInvite> {
  return api.post<CreatedInvite>(`/spaces/${spaceId}/invites`, {
    role,
    expires_in_days: expiresInDays,
    email,
    board_ids: boardIds,
  });
}

export function fetchSpaceInvites(spaceId: string): Promise<SpaceInvite[]> {
  return api.get<SpaceInvite[]>(`/spaces/${spaceId}/invites`);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await api.del<void>(`/invites/${inviteId}`);
}

export type AcceptedInvite = {
  status: "accepted" | "already_member";
  board_id: string;
  board_ids: string[];
};

// One of the two, never both: a link carries a token, the inbox carries an id
// whose addressee the API checks against the caller's own address.
export type InviteCredential = { token: string } | { invite_id: string };

// The credential travels in the body rather than the path, because an access
// log records URLs and an invite token is a bearer credential.
export function acceptInvite(
  credential: InviteCredential,
): Promise<AcceptedInvite> {
  return api.post<AcceptedInvite>("/invites/accept", credential);
}

export type Invitee = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
  // what stands in the way: their role on the board, or for a space the boards
  // of it they are already on, and any live invitation reaching it
  member_role?: string | null;
  member_board_ids?: string[];
  invited_until: string | null;
};

// Under two characters the API returns nothing — no walking the user table with a half-typed query.
export function searchInvitees(
  scope: InviteScope,
  query: string,
): Promise<Invitee[]> {
  const path =
    scope.kind === "board"
      ? `/boards/${scope.boardId}/invitees`
      : `/spaces/${scope.spaceId}/invitees`;

  return api.get<Invitee[]>(`${path}${toQuery({ q: query })}`);
}

export type MyInvite = {
  id: string;
  role: string;
  expires_at: string;
  board_id: string;
  space_id: string | null;
  space_title: string | null;
  // what accepting grants
  boards: InviteBoard[];
  inviter_name: string | null;
};

export type InvitePreview = {
  status: "pending" | "expired" | "member";
  kind: "board" | "space";
  role: string;
  expires_at: string;
  space_title: string | null;
  inviter_name: string | null;
  boards: (InviteBoard & { member: boolean })[];
};

// Changes nothing; a used, revoked or unknown credential answers with the same errors accept would.
export function previewInvite(
  credential: InviteCredential,
): Promise<InvitePreview> {
  return api.post<InvitePreview>("/invites/preview", credential);
}

// Not revokeInvite — this is the invitee declining, that one's the inviter withdrawing and needs admin.
export async function declineInvite(
  credential: InviteCredential,
): Promise<boolean> {
  await api.post<void>("/invites/decline", credential);

  return true;
}

// No arguments — the address comes from the caller's own session, so nobody can list invites for someone else.
export function fetchMyInvites(): Promise<MyInvite[]> {
  return api.get<MyInvite[]>("/invites/mine");
}
