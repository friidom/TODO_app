import type { Prisma } from "@prisma/client";

import { DEFAULT_COLUMNS } from "../../config/constants.js";
import { RANK_GAP } from "../../lib/rank.js";

export function usernameExists(tx: Prisma.TransactionClient, username: string): Promise<boolean> {
  return tx.profiles
    .count({ where: { username }, take: 1 })
    .then((count) => count > 0);
}

// Ordered so a user who somehow owns two boards always gets the same one back.
export async function firstOwnedBoardId(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string | undefined> {
  const board = await tx.boards.findFirst({
    where: { owner_id: userId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return board?.id;
}

export function upsertProfile(
  tx: Prisma.TransactionClient,
  profile: { id: string; email: string; username: string },
): Promise<{ id: string }> {
  return tx.profiles.upsert({
    where: { id: profile.id },
    create: profile,
    // Username is not overwritten — a second run must not rename someone.
    update: { email: profile.email },
    select: { id: true },
  });
}

export async function findSpaceByTitle(
  tx: Prisma.TransactionClient,
  ownerId: string,
  title: string,
): Promise<string | undefined> {
  const space = await tx.spaces.findFirst({
    where: { owner_id: ownerId, title: { equals: title, mode: "insensitive" } },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return space?.id;
}

export function insertSpace(
  tx: Prisma.TransactionClient,
  ownerId: string,
  title: string,
): Promise<{ id: string }> {
  return tx.spaces.create({ data: { owner_id: ownerId, title }, select: { id: true } });
}

export function insertBoard(
  tx: Prisma.TransactionClient,
  board: { ownerId: string; title: string; spaceId: string },
): Promise<{ id: string }> {
  return tx.boards.create({
    data: { owner_id: board.ownerId, title: board.title, space_id: board.spaceId },
    select: { id: true },
  });
}

export function insertDefaultColumns(
  tx: Prisma.TransactionClient,
  boardId: string,
): Promise<{ count: number }> {
  return tx.columns.createMany({
    data: DEFAULT_COLUMNS.map((column, index) => ({
      board_id: boardId,
      title: column.title,
      category: column.category,
      position: BigInt(index),
      rank: index * RANK_GAP,
    })),
  });
}

export function findProfile(tx: Prisma.TransactionClient, userId: string) {
  return tx.profiles.findUnique({
    where: { id: userId },
    select: { id: true, username: true, full_name: true, bio: true, avatar_url: true },
  });
}
