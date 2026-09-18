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
import * as invitesRepo from "./invites.repo.js";
import type { CreateInviteInput, InviteCredential } from "./invites.schema.js";

export interface CreatedInvite extends invitesRepo.InviteRow {
  token: string;
}

function notFound(): AppError {
  return new AppError("not_found", "Invitation not found.");
}

const DAY_MS = 86_400_000;

// Clamped, not validated: the modal offers 1, 7 and 30, and anything outside —
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

export function listPending(board: BoardContext): Promise<invitesRepo.InviteRow[]> {
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
    const invitee = await invitesRepo.findProfileByEmail(email);

    if (invitee === null) {
      throw new AppError("bad_request", "No registered user with that email.");
    }

    if (invitee.id === actor.id) {
      throw new AppError("bad_request", "You cannot invite yourself.");
    }

    if ((await membersRepo.roleOf(board.id, invitee.id)) !== null) {
      throw new AppError("conflict", "That person is already a member of this board.");
    }

    if (await invitesRepo.hasLiveInviteFor(board.id, email)) {
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
  board_id: string;
}

export async function accept(
  actor: Actor,
  credential: InviteCredential,
): Promise<AcceptResult> {
  return withActor(actor.id, async (tx) => {
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

    // BEFORE the spent check, which is what makes a repeat click by the person
    // who just accepted idempotent rather than an error. Their existing role is
    // neither read nor written.
    if ((await membersRepo.roleOf(invite.board_id, actor.id, tx)) !== null) {
      return { status: "already_member", board_id: invite.board_id };
    }

    if (invite.accepted_at !== null) {
      throw new AppError("conflict", "That invitation has already been used.");
    }

    await membersRepo.insertIfAbsent(tx, invite.board_id, actor.id, invite.role);
    await invitesRepo.markAccepted(tx, invite.id);

    return { status: "accepted", board_id: invite.board_id };
  });
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
    const addressed = normalizeEmail(invite.email);
    const caller = normalizeEmail((await invitesRepo.emailOf(actor.id, tx))?.email);

    if (addressed === null || caller === null || addressed !== caller) throw notFound();

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

  if (invite === null) return null;

  const profile = await invitesRepo.emailOf(actor.id, tx);
  const mine = normalizeEmail(profile?.email);
  const addressed = normalizeEmail(invite.email);

  if (mine === null || addressed === null || mine !== addressed) return null;

  return invite;
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
