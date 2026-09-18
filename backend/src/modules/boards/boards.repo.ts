import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import type { Actor } from "../../types/actor.js";

// THE SWAP POINT (§10.7). This is the Express replacement for the
// accessible_board_ids() SQL helper, and it must appear exactly once in the
// codebase: widening access later — an org-wide Director, say — is an edit
// here and nowhere else. That property is what let M3 widen the SQL version
// from owner-only to membership without touching a single policy.
//
// Membership alone is the whole answer: boards_add_owner_membership gives
// every board an owner row, so "owner ∪ member" collapses to "member".
//
// Never inline this query. If you find yourself writing
// `board_members.findMany({ where: { user_id } })` somewhere else, that is
// this function, and the swap point has just been lost.
export async function accessibleBoardIds(actor: Actor): Promise<string[]> {
  const rows = await prisma.board_members.findMany({
    where: { user_id: actor.id },
    select: { board_id: true },
  });

  return rows.map((row) => row.board_id);
}

const BOARD_FIELDS = {
  id: true,
  owner_id: true,
  title: true,
  description: true,
  icon: true,
  cover_color: true,
  visibility: true,
  created_at: true,
  updated_at: true,
  next_key: true,
  key_prefix: true,
  space_id: true,
} satisfies Prisma.boardsSelect;

export type BoardRow = Prisma.boardsGetPayload<{ select: typeof BOARD_FIELDS }>;

export function findMany(boardIds: string[]): Promise<BoardRow[]> {
  return prisma.boards.findMany({
    where: { id: { in: boardIds } },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: BOARD_FIELDS,
  });
}

export function findOne(boardId: string): Promise<BoardRow | null> {
  return prisma.boards.findUnique({ where: { id: boardId }, select: BOARD_FIELDS });
}

export interface BoardInsert {
  id: string;
  ownerId: string;
  title: string;
  spaceId: string | null;
}

export function insert(tx: Prisma.TransactionClient, board: BoardInsert): Promise<BoardRow> {
  return tx.boards.create({
    data: {
      id: board.id,
      owner_id: board.ownerId,
      title: board.title,
      space_id: board.spaceId,
    },
    select: BOARD_FIELDS,
  });
}

// Fields are named rather than spread: a patch object reaching Prisma intact
// would let a caller set owner_id, next_key or key_prefix.
export interface BoardPatch {
  title?: string | null;
  description?: string | null;
  icon?: string | null;
  cover_color?: string | null;
  visibility?: "private" | "team";
  space_id?: string | null;
}

export function update(
  tx: Prisma.TransactionClient,
  boardId: string,
  patch: BoardPatch,
): Promise<BoardRow> {
  return tx.boards.update({
    where: { id: boardId },
    data: {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.icon !== undefined && { icon: patch.icon }),
      ...(patch.cover_color !== undefined && { cover_color: patch.cover_color }),
      ...(patch.visibility !== undefined && { visibility: patch.visibility }),
      ...(patch.space_id !== undefined && { space_id: patch.space_id }),
    },
    select: BOARD_FIELDS,
  });
}

export async function remove(tx: Prisma.TransactionClient, boardId: string): Promise<void> {
  await tx.boards.delete({ where: { id: boardId } });
}

export function exists(boardId: string): Promise<boolean> {
  return prisma.boards.count({ where: { id: boardId }, take: 1 }).then((count) => count > 0);
}
