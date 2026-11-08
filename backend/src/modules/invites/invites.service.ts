import { invalidateBoard } from "../../cache/keys.js";
import {
  INVITE_EXPIRY_DEFAULT_DAYS,
  INVITE_EXPIRY_MAX_DAYS,
  INVITE_EXPIRY_MIN_DAYS,
  INVITEE_SEARCH_MIN_CHARS,
} from "../../config/constants.js";
import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
import { assignableRoles, isBoardRole } from "../../lib/permissions.js";
import { mintOpaqueToken, sha256 } from "../../lib/tokens.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import * as membersRepo from "../members/members.repo.js";
import * as spacesRepo from "../spaces/spaces.repo.js";
import * as invitesRepo from "./invites.repo.js";
import type {
  CreateInviteInput,
  CreateSpaceInviteInput,
  InviteCredential,
} from "./invites.schema.js";

export interface CreatedInvite extends invitesRepo.InviteRow {
  token: string;
}

function notFound(): AppError {
  return new AppError("not_found", "Invitation not found.");
}

const DAY_MS = 86_400_000;

// Clamped, not validated: anything outside the range the modal offers —
// including a crafted century and including null — is pulled into range. There
// is no argument meaning "never expires".
function expiryFrom(days: number | undefined): Date {
  const requested = Number.isFinite(days) ? (days as number) : INVITE_EXPIRY_DEFAULT_DAYS;
  const clamped = Math.min(Math.max(requested, INVITE_EXPIRY_MIN_DAYS), INVITE_EXPIRY_MAX_DAYS);

  return new Date(Date.now() + clamped * DAY_MS);
}

function normalizeEmail(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();

  return trimmed === "" ? null : trimmed;
}

// Spaces have no membership, so their owner is the only one who can reach one,
// and anyone else is told it is missing rather than forbidden.
async function ownedSpace(actor: Actor, spaceId: string): Promise<void> {
  if ((await spacesRepo.findOne(actor.id, spaceId)) === null) {
    throw new AppError("not_found", "Not found.");
  }
}

async function addressee(actor: Actor, email: string): Promise<string> {
  const invitee = await invitesRepo.findProfileByEmail(email);

  if (invitee === null) {
    throw new AppError("bad_request", "No registered user with that email.");
  }

  if (invitee.id === actor.id) {
    throw new AppError("bad_request", "You cannot invite yourself.");
  }

  return invitee.id;
}

export function listPending(board: BoardContext): Promise<invitesRepo.PendingInvite[]> {
  return invitesRepo.findPending(board.id);
}

export async function create(
  actor: Actor,
  board: BoardContext,
  input: CreateInviteInput,
): Promise<CreatedInvite> {
  if (!assignableRoles(board.role).includes(input.role)) {
    throw new AppError("forbidden", "You cannot invite someone at or above your own role.");
  }

  const email = normalizeEmail(input.email);

  if (email !== null) {
    const inviteeId = await addressee(actor, email);

    if ((await membersRepo.roleOf(board.id, inviteeId)) !== null) {
      throw new AppError("conflict", "That person is already a member of this board.");
    }

    if (await invitesRepo.hasLiveInviteFor([board.id], email)) {
      throw new AppError("conflict", "That person already has a pending invitation.");
    }
  }

  const { token, tokenHash } = mintOpaqueToken();

  const row = await withActor(actor.id, (tx) =>
    invitesRepo.insert(tx, {
      boardId: board.id,
      tokenHash,
      role: input.role,
      expiresAt: expiryFrom(input.expires_in_days),
      createdBy: actor.id,
      email,
    }),
  );

  return { ...row, token };
}

// One credential for the boards the owner ticked, fixed now: a board filed into
// the space later is not included. The role ceiling is checked on every board
// rather than assumed from owning the space.
export async function createForSpace(
  actor: Actor,
  spaceId: string,
  input: CreateSpaceInviteInput,
): Promise<CreatedInvite> {
  await ownedSpace(actor, spaceId);

  const boardIds = [...new Set(input.board_ids)];
  const inSpace = new Set(
    (await invitesRepo.boardsInSpace(spaceId, actor.id)).map((board) => board.id),
  );

  if (!boardIds.every((id) => inSpace.has(id))) {
    throw new AppError("bad_request", "Every board you choose must be in this space.");
  }

  for (const boardId of boardIds) {
    if (!assignableRoles(await membersRepo.roleOf(boardId, actor.id)).includes(input.role)) {
      throw new AppError("forbidden", "You cannot invite someone at or above your own role.");
    }
  }

  const email = normalizeEmail(input.email);

  if (email !== null) {
    const inviteeId = await addressee(actor, email);

    if ((await invitesRepo.memberBoardIds(inviteeId, boardIds)).size === boardIds.length) {
      throw new AppError("conflict", "That person already has access to every board you chose.");
    }

    if (await invitesRepo.hasLiveInviteFor(boardIds, email)) {
      throw new AppError("conflict", "That person already has a pending invitation.");
    }
  }

  const { token, tokenHash } = mintOpaqueToken();

  const row = await withActor(actor.id, (tx) =>
    invitesRepo.insertForSpace(
      tx,
      {
        spaceId,
        tokenHash,
        role: input.role,
        expiresAt: expiryFrom(input.expires_in_days),
        createdBy: actor.id,
        email,
      },
      boardIds,
    ),
  );

  return { ...row, token };
}

export async function listSpacePending(
  actor: Actor,
  spaceId: string,
): Promise<invitesRepo.SpacePendingInvite[]> {
  await ownedSpace(actor, spaceId);

  return invitesRepo.findSpacePending(spaceId);
}

export async function revoke(
  actor: Actor,
  board: BoardContext,
  inviteId: string,
): Promise<void> {
  await withActor(actor.id, async (tx) => {
    const invite = await invitesRepo.lockById(tx, inviteId);

    // boardAccess already proved the invite belongs to this board; this guards
    // the window between that resolution and the lock.
    if (invite === null || invite.board_id !== board.id) throw notFound();

    // An admin of one of its boards does not get to withdraw the others.
    if (invite.space_id !== null && !(await invitesRepo.ownsSpace(tx, invite.space_id, actor.id))) {
      throw new AppError("forbidden", "Only the space's owner can revoke a space invitation.");
    }

    if (invite.accepted_at !== null) {
      throw new AppError(
        "conflict",
        "That invitation has already been accepted; remove the member instead.",
      );
    }

    await invitesRepo.deleteById(tx, inviteId);
  });
}

export async function mine(actor: Actor): Promise<invitesRepo.MyInvite[]> {
  const profile = await invitesRepo.emailOf(actor.id);
  const email = normalizeEmail(profile?.email);

  if (email === null) return [];

  return invitesRepo.findAddressedTo(actor.id, email);
}

export interface AcceptResult {
  status: "accepted" | "already_member";
  // Where to go next: the first board joined, or the first one offered.
  board_id: string;
  board_ids: string[];
}

export async function accept(
  actor: Actor,
  credential: InviteCredential,
): Promise<AcceptResult> {
  const result = await withActor(actor.id, async (tx): Promise<AcceptResult> => {
    const invite = await locate(tx, actor, credential);

    // A revoked invite is a deleted row, so a revoked token and one that never
    // existed are indistinguishable from outside. That is the point.
    if (invite === null) throw notFound();

    if (invite.expires_at <= new Date()) {
      throw new AppError("bad_request", "That invitation has expired.");
    }

    if (!isBoardRole(invite.role) || invite.role === "owner") {
      throw new AppError("forbidden", "That invitation cannot be accepted.");
    }

    const offered =
      invite.space_id === null
        ? [invite.board_id]
        : await invitesRepo.grantableBoards(tx, invite.id, invite.space_id);

    if (offered.length === 0) throw notFound();

    const joining: string[] = [];

    for (const boardId of offered) {
      if ((await membersRepo.roleOf(boardId, actor.id, tx)) === null) joining.push(boardId);
    }

    // BEFORE the spent check, which is what makes a repeat click by the person
    // who just accepted idempotent rather than an error. An existing role is
    // neither read nor written.
    if (joining.length === 0) {
      return { status: "already_member", board_id: offered[0]!, board_ids: offered };
    }

    if (invite.accepted_at !== null) {
      throw new AppError("conflict", "That invitation has already been used.");
    }

    for (const boardId of joining) {
      await membersRepo.insertIfAbsent(tx, boardId, actor.id, invite.role);
    }

    await invitesRepo.markAccepted(tx, invite.id);

    return { status: "accepted", board_id: joining[0]!, board_ids: joining };
  });

  if (result.status === "accepted") {
    for (const boardId of result.board_ids) {
      await invalidateBoard(boardId, ["members", "activities"]);
    }
  }

  return result;
}

export async function decline(actor: Actor, credential: InviteCredential): Promise<void> {
  await withActor(actor.id, async (tx) => {
    const invite = await locate(tx, actor, credential);

    if (invite === null || invite.accepted_at !== null || invite.expires_at <= new Date()) {
      throw notFound();
    }

    // Declining is the addressee refusing, so the address is read from the
    // caller and never passed in. Holding the token is not enough: a link
    // invite has no addressee at all and can only be revoked by an admin.
    if (!(await isAddressee(actor, invite, tx))) throw notFound();

    await invitesRepo.deleteById(tx, invite.id);
  });
}

// An invite_id is only ever disclosed to the addressee, so matching the
// caller's own email is what authorizes that form. A mismatch is reported as a
// miss rather than a refusal, so an id cannot be probed for existence.
async function locate(
  tx: Parameters<typeof invitesRepo.lockById>[0],
  actor: Actor,
  credential: InviteCredential,
): Promise<invitesRepo.LockedInvite | null> {
  if (credential.token !== undefined) {
    return invitesRepo.lockByTokenHash(tx, sha256(credential.token));
  }

  const invite = await invitesRepo.lockById(tx, credential.invite_id!);

  return invite && (await isAddressee(actor, invite, tx)) ? invite : null;
}

async function isAddressee(
  actor: Actor,
  invite: { email: string | null },
  client?: Parameters<typeof invitesRepo.emailOf>[1],
): Promise<boolean> {
  const mine = normalizeEmail((await invitesRepo.emailOf(actor.id, client))?.email);
  const addressed = normalizeEmail(invite.email);

  return mine !== null && addressed !== null && mine === addressed;
}

export interface InvitePreview {
  status: "pending" | "expired" | "member";
  kind: "board" | "space";
  role: string;
  expires_at: Date;
  space_title: string | null;
  inviter_name: string | null;
  boards: (invitesRepo.InviteBoard & { member: boolean })[];
}

// Accept's lookup without its lock or its write. Holding the credential already
// lets the caller accept, so this shows them nothing accepting would not.
export async function preview(
  actor: Actor,
  credential: InviteCredential,
): Promise<InvitePreview> {
  const invite =
    credential.token !== undefined
      ? await invitesRepo.findDetailsByTokenHash(sha256(credential.token))
      : await invitesRepo.findDetailsById(credential.invite_id!).then(async (found) =>
          found && (await isAddressee(actor, found)) ? found : null,
        );

  if (invite === null || invite.boards.length === 0) throw notFound();

  const member = await invitesRepo.memberBoardIds(
    actor.id,
    invite.boards.map((board) => board.id),
  );
  const everywhere = member.size === invite.boards.length;

  if (!everywhere && invite.accepted_at !== null) {
    throw new AppError("conflict", "That invitation has already been used.");
  }

  return {
    status: everywhere ? "member" : invite.expires_at <= new Date() ? "expired" : "pending",
    kind: invite.space_id === null ? "board" : "space",
    role: invite.role,
    expires_at: invite.expires_at,
    space_title: invite.space_title,
    inviter_name: invite.inviter_name,
    boards: invite.boards.map((board) => ({ ...board, member: member.has(board.id) })),
  };
}

export async function searchInvitees(
  actor: Actor,
  board: BoardContext,
  query: string,
): Promise<invitesRepo.Invitee[]> {
  const needle = query.trim();

  // Below two characters this returns "some of everybody"; an empty result is
  // the honest answer to a query that has not been typed yet.
  if (needle.length < INVITEE_SEARCH_MIN_CHARS) return [];

  return invitesRepo.searchInvitees(board.id, actor.id, needle);
}

export async function searchSpaceInvitees(
  actor: Actor,
  spaceId: string,
  query: string,
): Promise<invitesRepo.SpaceInvitee[]> {
  await ownedSpace(actor, spaceId);

  const needle = query.trim();

  if (needle.length < INVITEE_SEARCH_MIN_CHARS) return [];

  return invitesRepo.searchSpaceInvitees(spaceId, actor.id, needle);
}
