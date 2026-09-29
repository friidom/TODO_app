import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { DEFAULT_COLUMNS } from "../../config/constants.js";
import { prisma } from "../../db/prisma.js";
import { RANK_GAP } from "../../lib/rank.js";
import { defaultTransitions } from "../../lib/workflow.js";

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

// One status per default column, carrying the column's title and category:
// the board a new account starts with reads exactly as it did before statuses
// were their own rows.
export async function insertDefaultWorkflow(
  tx: Prisma.TransactionClient,
  boardId: string,
): Promise<void> {
  const columns = DEFAULT_COLUMNS.map((column, index) => ({ ...column, id: randomUUID(), index }));

  await tx.columns.createMany({
    data: columns.map((column) => ({
      id: column.id,
      board_id: boardId,
      title: column.title,
      position: BigInt(column.index),
      rank: column.index * RANK_GAP,
    })),
  });

  const statuses = columns.map((column) => ({ ...column, statusId: randomUUID() }));

  await tx.statuses.createMany({
    data: statuses.map((column) => ({
      id: column.statusId,
      board_id: boardId,
      column_id: column.id,
      name: column.title,
      category: column.category,
      rank: RANK_GAP,
    })),
  });

  await tx.status_transitions.createMany({
    data: defaultTransitions(
      statuses.map((column) => ({ id: column.statusId, category: column.category })),
    ).map((edge) => ({ board_id: boardId, from_status_id: edge.from, to_status_id: edge.to })),
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

// avatar_url is absent on purpose: it is set only by uploading or removing an
// avatar, never by a general profile PATCH. Accepting it here would let anyone
// point their profile at another user's object.
export interface ProfilePatch {
  username?: string;
  full_name?: string | null;
  bio?: string | null;
}

export function findAvatarUrl(userId: string): Promise<{ avatar_url: string | null } | null> {
  return prisma.profiles.findUnique({ where: { id: userId }, select: { avatar_url: true } });
}

// Scoped to the one column. The general updateProfile no longer accepts
// avatar_url at all, so this is the only way it changes.
export function setAvatarUrl(userId: string, avatarUrl: string | null): Promise<ProfileRow> {
  return prisma.profiles.update({
    where: { id: userId },
    data: { avatar_url: avatarUrl },
    select: PROFILE_FIELDS,
  });
}

export function updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRow> {
  return prisma.profiles.update({
    where: { id: userId },
    data: {
      ...(patch.username !== undefined && { username: patch.username }),
      ...(patch.full_name !== undefined && { full_name: patch.full_name }),
      ...(patch.bio !== undefined && { bio: patch.bio }),
    },
    select: PROFILE_FIELDS,
  });
}
