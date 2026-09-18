import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

const SPACE_FIELDS = {
  id: true,
  owner_id: true,
  title: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.spacesSelect;

export type SpaceRow = Prisma.spacesGetPayload<{ select: typeof SPACE_FIELDS }>;

// A space has no membership, so boardAccess cannot guard it. ownerId takes the
// place boardId holds elsewhere: first, required, and part of every lookup —
// so a space belonging to someone else is missing rather than forbidden, the
// same answer boardAccess gives.
export function findMany(ownerId: string): Promise<SpaceRow[]> {
  return prisma.spaces.findMany({
    where: { owner_id: ownerId },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    select: SPACE_FIELDS,
  });
}

export function findOne(ownerId: string, spaceId: string): Promise<SpaceRow | null> {
  return prisma.spaces.findFirst({
    where: { id: spaceId, owner_id: ownerId },
    select: SPACE_FIELDS,
  });
}

export function insert(
  ownerId: string,
  space: { id: string; title: string },
): Promise<SpaceRow> {
  return prisma.spaces.create({
    data: { id: space.id, owner_id: ownerId, title: space.title },
    select: SPACE_FIELDS,
  });
}

// updateMany/deleteMany rather than update/delete: the owner_id predicate has
// to be part of the write, not a check before it, or a space could be renamed
// out from under its owner between the two statements.
export function update(
  ownerId: string,
  spaceId: string,
  patch: { title: string },
): Promise<number> {
  return prisma.spaces
    .updateMany({ where: { id: spaceId, owner_id: ownerId }, data: { title: patch.title } })
    .then((result) => result.count);
}

export function remove(ownerId: string, spaceId: string): Promise<number> {
  return prisma.spaces
    .deleteMany({ where: { id: spaceId, owner_id: ownerId } })
    .then((result) => result.count);
}
