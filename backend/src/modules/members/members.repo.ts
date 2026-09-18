import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import { isBoardRole, type BoardRole } from "../../lib/permissions.js";

// Null for a non-member AND for a role outside the matrix: a row that fell
// outside board_members_role_check is broken, and "no access" is the only safe
// reading of it.
export async function roleOf(
  boardId: string,
  userId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<BoardRole | null> {
  const row = await client.board_members.findUnique({
    where: { board_id_user_id: { board_id: boardId, user_id: userId } },
    select: { role: true },
  });

  return row !== null && isBoardRole(row.role) ? row.role : null;
}

export interface RosterEntry {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: Date;
}

// These six fields are the security boundary, not a convenience: email and bio
// exist on profiles and are withheld from co-members (RLS_AUDIT §327).
export async function roster(boardId: string): Promise<RosterEntry[]> {
  const rows = await prisma.board_members.findMany({
    where: { board_id: boardId },
    orderBy: [{ joined_at: "asc" }, { user_id: "asc" }],
    select: {
      role: true,
      joined_at: true,
      profiles: { select: { id: true, username: true, full_name: true, avatar_url: true } },
    },
  });

  return rows.map((row) => ({
    id: row.profiles.id,
    username: row.profiles.username,
    full_name: row.profiles.full_name,
    avatar_url: row.profiles.avatar_url,
    role: row.role,
    joined_at: row.joined_at,
  }));
}

// Both sources, because a target who is not yet a member has no membership row.
export async function isOwner(boardId: string, userId: string): Promise<boolean> {
  const [membership, board] = await Promise.all([
    prisma.board_members.count({
      where: { board_id: boardId, user_id: userId, role: "owner" },
      take: 1,
    }),
    prisma.boards.count({ where: { id: boardId, owner_id: userId }, take: 1 }),
  ]);

  return membership > 0 || board > 0;
}

// Raw because Prisma's fluent API cannot express FOR UPDATE. Without the lock a
// concurrent promotion could change this role between the read and the write,
// and the caller would act on a rank it no longer has.
export async function lockMembership(
  tx: Prisma.TransactionClient,
  boardId: string,
  userId: string,
): Promise<BoardRole | null> {
  const rows = await tx.$queryRaw<{ role: string }[]>`
    select role from board_members
     where board_id = ${boardId}::uuid
       and user_id  = ${userId}::uuid
     for update`;

  const role = rows[0]?.role;

  return role !== undefined && isBoardRole(role) ? role : null;
}

// Returns false instead of raising 23505, so a concurrent double add is
// serialised by the primary key and the loser gets the same message a
// sequential second call would.
export async function insertIfAbsent(
  tx: Prisma.TransactionClient,
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<boolean> {
  const inserted = await tx.$executeRaw`
    insert into board_members (board_id, user_id, role)
    values (${boardId}::uuid, ${userId}::uuid, ${role})
    on conflict (board_id, user_id) do nothing`;

  return inserted > 0;
}

export function updateRole(
  tx: Prisma.TransactionClient,
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<number> {
  return tx.board_members
    .updateMany({ where: { board_id: boardId, user_id: userId }, data: { role } })
    .then((result) => result.count);
}

export function remove(
  tx: Prisma.TransactionClient,
  boardId: string,
  userId: string,
): Promise<number> {
  return tx.board_members
    .deleteMany({ where: { board_id: boardId, user_id: userId } })
    .then((result) => result.count);
}

export function profileExists(userId: string): Promise<boolean> {
  return prisma.profiles.count({ where: { id: userId }, take: 1 }).then((count) => count > 0);
}
