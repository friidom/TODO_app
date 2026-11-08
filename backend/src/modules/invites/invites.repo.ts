import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

// token_hash is absent from every shape a client can see. The plaintext is
// returned once, by create, and is unrecoverable afterwards.
const INVITE_FIELDS = {
  id: true,
  board_id: true,
  space_id: true,
  email: true,
  role: true,
  expires_at: true,
  created_by: true,
  accepted_at: true,
  created_at: true,
} satisfies Prisma.board_invitesSelect;

export type InviteRow = Prisma.board_invitesGetPayload<{ select: typeof INVITE_FIELDS }>;

const NEWEST_FIRST = [{ created_at: "desc" }, { id: "desc" }] satisfies Prisma.board_invitesOrderByWithRelationInput[];

function live(): Prisma.board_invitesWhereInput {
  return { accepted_at: null, expires_at: { gt: new Date() } };
}

// A board invitation reaches its board by naming it, a space invitation by
// listing it; board_id is always one of a space invitation's own boards.
function reaching(boardIds: readonly string[]): Prisma.board_invitesWhereInput {
  return {
    OR: [
      { board_id: { in: [...boardIds] } },
      { board_invite_boards: { some: { board_id: { in: [...boardIds] } } } },
    ],
  };
}

export interface InviteBoard {
  id: string;
  title: string | null;
  key: string;
}

const BOARD_FIELDS = { id: true, title: true, key_prefix: true } satisfies Prisma.boardsSelect;

function toBoard(board: { id: string; title: string | null; key_prefix: string }): InviteBoard {
  return { id: board.id, title: board.title, key: board.key_prefix };
}

const byTitle = (a: InviteBoard, b: InviteBoard) =>
  (a.title ?? "").localeCompare(b.title ?? "") || a.id.localeCompare(b.id);

export interface PendingInvite extends InviteRow {
  space_title: string | null;
  board_count: number;
}

// A space invitation that lists this board is pending for it too, so nobody
// is invited to the board twice without seeing it.
export async function findPending(boardId: string): Promise<PendingInvite[]> {
  const rows = await prisma.board_invites.findMany({
    where: { ...live(), ...reaching([boardId]) },
    orderBy: NEWEST_FIRST,
    select: {
      ...INVITE_FIELDS,
      spaces: { select: { title: true } },
      _count: { select: { board_invite_boards: true } },
    },
  });

  return rows.map(({ spaces, _count, ...row }) => ({
    ...row,
    space_title: spaces?.title ?? null,
    board_count: row.space_id === null ? 1 : _count.board_invite_boards,
  }));
}

export interface SpacePendingInvite extends InviteRow {
  boards: InviteBoard[];
}

export async function findSpacePending(spaceId: string): Promise<SpacePendingInvite[]> {
  const rows = await prisma.board_invites.findMany({
    where: { ...live(), space_id: spaceId },
    orderBy: NEWEST_FIRST,
    select: {
      ...INVITE_FIELDS,
      board_invite_boards: { select: { boards: { select: BOARD_FIELDS } } },
    },
  });

  return rows.map(({ board_invite_boards, ...row }) => ({
    ...row,
    boards: board_invite_boards.map((link) => toBoard(link.boards)).sort(byTitle),
  }));
}

export interface InviteInsert {
  boardId: string;
  spaceId?: string | null;
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
      space_id: invite.spaceId ?? null,
      token_hash: invite.tokenHash,
      role: invite.role,
      expires_at: invite.expiresAt,
      created_by: invite.createdBy,
      email: invite.email,
    },
    select: INVITE_FIELDS,
  });
}

// The first board is the row's board_id; every board, that one included, is listed.
export async function insertForSpace(
  tx: Prisma.TransactionClient,
  invite: Omit<InviteInsert, "boardId"> & { spaceId: string },
  boardIds: readonly string[],
): Promise<InviteRow> {
  const row = await insert(tx, { ...invite, boardId: boardIds[0]! });

  await tx.board_invite_boards.createMany({
    data: boardIds.map((board_id) => ({ invite_id: row.id, board_id })),
  });

  return row;
}

export interface LockedInvite {
  id: string;
  board_id: string;
  space_id: string | null;
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
    select id, board_id, space_id, email, role, expires_at, accepted_at
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
    select id, board_id, space_id, email, role, expires_at, accepted_at
      from board_invites
     where id = ${inviteId}::uuid
     for update`;

  return rows[0] ?? null;
}

// Only the listed boards still filed in the invitation's space: a board moved
// out of it since is no longer what was offered.
export async function grantableBoards(
  tx: Prisma.TransactionClient,
  inviteId: string,
  spaceId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ board_id: string }[]>`
    select j.board_id
      from board_invite_boards j
      join boards b on b.id = j.board_id
     where j.invite_id = ${inviteId}::uuid
       and b.space_id = ${spaceId}::uuid
     order by b.title, b.id`;

  return rows.map((row) => row.board_id);
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

export function hasLiveInviteFor(boardIds: readonly string[], email: string): Promise<boolean> {
  return prisma.board_invites
    .count({
      where: {
        ...live(),
        ...reaching(boardIds),
        email: { equals: email, mode: "insensitive" },
      },
      take: 1,
    })
    .then((count) => count > 0);
}

export async function memberBoardIds(
  userId: string,
  boardIds: readonly string[],
): Promise<Set<string>> {
  const rows = await prisma.board_members.findMany({
    where: { user_id: userId, board_id: { in: [...boardIds] } },
    select: { board_id: true },
  });

  return new Set(rows.map((row) => row.board_id));
}

export async function ownsSpace(
  client: Prisma.TransactionClient,
  spaceId: string,
  ownerId: string,
): Promise<boolean> {
  return (await client.spaces.count({ where: { id: spaceId, owner_id: ownerId } })) > 0;
}

export function boardsInSpace(
  spaceId: string,
  ownerId: string,
): Promise<{ id: string; title: string | null }[]> {
  return prisma.boards.findMany({
    where: { space_id: spaceId, owner_id: ownerId },
    select: { id: true, title: true },
  });
}

// What an invitee is shown about an invitation: where it leads and who sent it.
const DETAIL_FIELDS = {
  id: true,
  board_id: true,
  space_id: true,
  email: true,
  role: true,
  expires_at: true,
  accepted_at: true,
  boards: { select: { ...BOARD_FIELDS, spaces: { select: { title: true } } } },
  spaces: { select: { title: true } },
  board_invite_boards: { select: { boards: { select: { ...BOARD_FIELDS, space_id: true } } } },
  profiles: { select: { full_name: true, username: true } },
} satisfies Prisma.board_invitesSelect;

type DetailRecord = Prisma.board_invitesGetPayload<{ select: typeof DETAIL_FIELDS }>;

export interface InviteDetails {
  id: string;
  board_id: string;
  space_id: string | null;
  email: string | null;
  role: string;
  expires_at: Date;
  accepted_at: Date | null;
  // The invitation's own space, or the board's for a board invitation.
  space_title: string | null;
  // What accepting would grant, by grantableBoards' rule.
  boards: InviteBoard[];
  inviter_name: string | null;
}

function toDetails({
  boards,
  spaces,
  board_invite_boards,
  profiles,
  ...invite
}: DetailRecord): InviteDetails {
  const granted =
    invite.space_id === null
      ? [toBoard(boards)]
      : board_invite_boards
          .map((link) => link.boards)
          .filter((board) => board.space_id === invite.space_id)
          .map(toBoard)
          .sort(byTitle);

  return {
    ...invite,
    space_title: invite.space_id === null ? (boards.spaces?.title ?? null) : (spaces?.title ?? null),
    boards: granted,
    inviter_name: profiles ? profiles.full_name || profiles.username : null,
  };
}

export function findDetailsByTokenHash(tokenHash: string): Promise<InviteDetails | null> {
  return prisma.board_invites
    .findUnique({ where: { token_hash: tokenHash }, select: DETAIL_FIELDS })
    .then((row) => row && toDetails(row));
}

export function findDetailsById(inviteId: string): Promise<InviteDetails | null> {
  return prisma.board_invites
    .findUnique({ where: { id: inviteId }, select: DETAIL_FIELDS })
    .then((row) => row && toDetails(row));
}

// The address is the caller's own and accepted_at is always null here, so
// neither tells the inbox anything it should not see.
export type MyInvite = InviteDetails;

// Excludes an invitation every board of which the caller already belongs to, so
// one overtaken by a direct add does not sit in the inbox forever.
export async function findAddressedTo(userId: string, email: string): Promise<MyInvite[]> {
  const rows = await prisma.board_invites.findMany({
    where: { ...live(), email: { equals: email, mode: "insensitive" } },
    orderBy: NEWEST_FIRST,
    select: DETAIL_FIELDS,
  });

  const invites = rows.map(toDetails);
  const member = await memberBoardIds(
    userId,
    invites.flatMap((invite) => invite.boards.map((board) => board.id)),
  );

  return invites.filter((invite) => invite.boards.some((board) => !member.has(board.id)));
}

export interface Invitee {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
  member_role: string | null;
  invited_until: Date | null;
}

// Members and people already invited come back marked rather than missing, so
// the dialog can say why they cannot be invited instead of "no users found".
// The caller never does. An exact address sorts first because someone who
// typed the whole thing means it, then anyone who can actually be invited.
export async function searchInvitees(
  boardId: string,
  actorId: string,
  needle: string,
): Promise<Invitee[]> {
  const like = `%${needle}%`;

  return prisma.$queryRaw<Invitee[]>`
    select p.id, p.email, p.full_name, p.username, p.avatar_url,
           m.role as member_role, i.invited_until
      from profiles p
      left join board_members m
        on m.board_id = ${boardId}::uuid and m.user_id = p.id
      left join lateral (
        select max(inv.expires_at) as invited_until
          from board_invites inv
         where lower(inv.email) = lower(p.email)
           and inv.accepted_at is null
           and inv.expires_at > now()
           and (inv.board_id = ${boardId}::uuid
                or exists (select 1 from board_invite_boards j
                            where j.invite_id = inv.id and j.board_id = ${boardId}::uuid))
      ) i on true
     where p.id <> ${actorId}::uuid
       and (p.email ilike ${like} or p.full_name ilike ${like} or p.username ilike ${like})
     order by (lower(p.email) = lower(${needle})) desc,
              (m.role is null and i.invited_until is null) desc,
              p.email
     limit 8`;
}

export interface SpaceInvitee extends Omit<Invitee, "member_role"> {
  member_board_ids: string[];
}

// The space's version of searchInvitees: which of its boards the person is
// already on, and whether any live invitation already reaches one of them.
export async function searchSpaceInvitees(
  spaceId: string,
  actorId: string,
  needle: string,
): Promise<SpaceInvitee[]> {
  const like = `%${needle}%`;

  return prisma.$queryRaw<SpaceInvitee[]>`
    select p.id, p.email, p.full_name, p.username, p.avatar_url,
           array(
             select m.board_id::text
               from board_members m
               join boards b on b.id = m.board_id
              where b.space_id = ${spaceId}::uuid and m.user_id = p.id
           ) as member_board_ids,
           i.invited_until
      from profiles p
      left join lateral (
        select max(inv.expires_at) as invited_until
          from board_invites inv
         where lower(inv.email) = lower(p.email)
           and inv.accepted_at is null
           and inv.expires_at > now()
           and (inv.space_id = ${spaceId}::uuid
                or inv.board_id in (select b.id from boards b where b.space_id = ${spaceId}::uuid))
      ) i on true
     where p.id <> ${actorId}::uuid
       and (p.email ilike ${like} or p.full_name ilike ${like} or p.username ilike ${like})
     order by (lower(p.email) = lower(${needle})) desc,
              (i.invited_until is null) desc,
              p.email
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

// Takes the transaction client when one is open. Reading through the global
// client while holding a transaction borrows a SECOND connection from a pool of
// ten, so enough concurrent accepts would each hold one and wait for another.
export function emailOf(
  userId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<{ email: string | null } | null> {
  return client.profiles.findUnique({ where: { id: userId }, select: { email: true } });
}
