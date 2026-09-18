import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

// token_hash is absent from every shape a client can see. The plaintext is
// returned once, by create, and is unrecoverable afterwards.
const INVITE_FIELDS = {
  id: true,
  board_id: true,
  email: true,
  role: true,
  expires_at: true,
  created_by: true,
  accepted_at: true,
  created_at: true,
} satisfies Prisma.board_invitesSelect;

export type InviteRow = Prisma.board_invitesGetPayload<{ select: typeof INVITE_FIELDS }>;

export function findPending(boardId: string): Promise<InviteRow[]> {
  return prisma.board_invites.findMany({
    where: { board_id: boardId, accepted_at: null, expires_at: { gt: new Date() } },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: INVITE_FIELDS,
  });
}

export interface InviteInsert {
  boardId: string;
  tokenHash: string;
  role: string;
  expiresAt: Date;
  createdBy: string;
  email: string | null;
}

export function insert(tx: Prisma.TransactionClient, invite: InviteInsert): Promise<InviteRow> {
  return tx.board_invites.create({
    data: {
      board_id: invite.boardId,
      token_hash: invite.tokenHash,
      role: invite.role,
      expires_at: invite.expiresAt,
      created_by: invite.createdBy,
      email: invite.email,
    },
    select: INVITE_FIELDS,
  });
}

export interface LockedInvite {
  id: string;
  board_id: string;
  email: string | null;
  role: string;
  expires_at: Date;
  accepted_at: Date | null;
}

// FOR UPDATE is the whole point: without it two clicks on one link both read
// accepted_at as null and both are admitted. Prisma's fluent API cannot
// express the lock.
export async function lockByTokenHash(
  tx: Prisma.TransactionClient,
  tokenHash: string,
): Promise<LockedInvite | null> {
  const rows = await tx.$queryRaw<LockedInvite[]>`
    select id, board_id, email, role, expires_at, accepted_at
      from board_invites
     where token_hash = ${tokenHash}
     for update`;

  return rows[0] ?? null;
}

export async function lockById(
  tx: Prisma.TransactionClient,
  inviteId: string,
): Promise<LockedInvite | null> {
  const rows = await tx.$queryRaw<LockedInvite[]>`
    select id, board_id, email, role, expires_at, accepted_at
      from board_invites
     where id = ${inviteId}::uuid
     for update`;

  return rows[0] ?? null;
}

export async function markAccepted(
  tx: Prisma.TransactionClient,
  inviteId: string,
): Promise<void> {
  await tx.board_invites.update({
    where: { id: inviteId },
    data: { accepted_at: new Date() },
  });
}

export async function deleteById(
  tx: Prisma.TransactionClient,
  inviteId: string,
): Promise<number> {
  const { count } = await tx.board_invites.deleteMany({ where: { id: inviteId } });

  return count;
}

export function hasLiveInviteFor(boardId: string, email: string): Promise<boolean> {
  return prisma.board_invites
    .count({
      where: {
        board_id: boardId,
        email: { equals: email, mode: "insensitive" },
        accepted_at: null,
        expires_at: { gt: new Date() },
      },
      take: 1,
    })
    .then((count) => count > 0);
}

export interface MyInvite {
  id: string;
  role: string;
  expires_at: Date;
  board_id: string;
  board_title: string | null;
}

// Excludes boards the caller already belongs to, so an invite that has been
// overtaken by a direct add does not sit in the inbox forever.
export async function findAddressedTo(userId: string, email: string): Promise<MyInvite[]> {
  const rows = await prisma.board_invites.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      accepted_at: null,
      expires_at: { gt: new Date() },
      boards: { board_members: { none: { user_id: userId } } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      id: true,
      role: true,
      expires_at: true,
      board_id: true,
      boards: { select: { title: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    expires_at: row.expires_at,
    board_id: row.board_id,
    board_title: row.boards.title,
  }));
}

export interface Invitee {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
}

// Excludes the caller, existing members and anyone already holding a live
// invite; an exact address sorts first because someone who typed the whole
// thing means it.
export async function searchInvitees(
  boardId: string,
  actorId: string,
  needle: string,
): Promise<Invitee[]> {
  const like = `%${needle}%`;

  return prisma.$queryRaw<Invitee[]>`
    select p.id, p.email, p.full_name, p.username, p.avatar_url
      from profiles p
     where p.id <> ${actorId}::uuid
       and (p.email ilike ${like} or p.full_name ilike ${like} or p.username ilike ${like})
       and not exists (
         select 1 from board_members m
          where m.board_id = ${boardId}::uuid and m.user_id = p.id
       )
       and not exists (
         select 1 from board_invites i
          where i.board_id = ${boardId}::uuid
            and lower(i.email) = lower(p.email)
            and i.accepted_at is null
            and i.expires_at > now()
       )
     order by (lower(p.email) = lower(${needle})) desc, p.email
     limit 8`;
}

export function findProfileByEmail(
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  return prisma.profiles.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true },
  });
}

export function emailOf(userId: string): Promise<{ email: string | null } | null> {
  return prisma.profiles.findUnique({ where: { id: userId }, select: { email: true } });
}
