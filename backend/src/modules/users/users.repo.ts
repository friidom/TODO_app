import type { Prisma } from "@prisma/client";

import { DEFAULT_COLUMNS } from "../../config/constants.js";
import { prisma } from "../../db/prisma.js";
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

const PROFILE_FIELDS = {
  id: true,
  username: true,
  full_name: true,
  bio: true,
  avatar_url: true,
  created_at: true,
} satisfies Prisma.profilesSelect;

export type ProfileRow = Prisma.profilesGetPayload<{ select: typeof PROFILE_FIELDS }>;

// email is not in PROFILE_FIELDS. profiles is self-only today and the roster is
// the only teammate-identity read; a profile shape that carries email is how
// that boundary gets lost (RLS_AUDIT §327).
export function findProfileById(userId: string): Promise<ProfileRow | null> {
  return prisma.profiles.findUnique({ where: { id: userId }, select: PROFILE_FIELDS });
}

export interface ProfilePatch {
  username?: string;
  full_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
}

export function updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRow> {
  return prisma.profiles.update({
    where: { id: userId },
    data: {
      ...(patch.username !== undefined && { username: patch.username }),
      ...(patch.full_name !== undefined && { full_name: patch.full_name }),
      ...(patch.bio !== undefined && { bio: patch.bio }),
      ...(patch.avatar_url !== undefined && { avatar_url: patch.avatar_url }),
    },
    select: PROFILE_FIELDS,
  });
}
