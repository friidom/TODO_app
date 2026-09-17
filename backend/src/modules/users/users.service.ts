import type { Prisma } from "@prisma/client";

import { DEFAULT_BOARD_TITLE, DEFAULT_SPACE_TITLE } from "../../config/constants.js";
import { suffixedUsername, usernameBase } from "../../lib/username.js";
import * as usersRepo from "./users.repo.js";

// Resolved rather than asserted: a collision here means the name was taken in
// the gap since availability was checked, so `ada2` beats failing the signup.
export async function resolveAvailableUsername(
  tx: Prisma.TransactionClient,
  wanted: string,
  seed: string,
): Promise<string> {
  const base = usernameBase(wanted, seed);

  let candidate = base;
  let suffix = 1;

  while (await usersRepo.usernameExists(tx, candidate)) {
    suffix += 1;
    candidate = suffixedUsername(base, suffix);
  }

  return candidate;
}

// Idempotent: a user who already owns a board gets that board back, not a
// second one.
export async function provisionUser(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string; username: string },
): Promise<string> {
  const existing = await usersRepo.firstOwnedBoardId(tx, user.id);

  if (existing !== undefined) return existing;

  const username = await resolveAvailableUsername(tx, user.username, user.id);

  await usersRepo.upsertProfile(tx, { id: user.id, email: user.email, username });

  const spaceId =
    (await usersRepo.findSpaceByTitle(tx, user.id, DEFAULT_SPACE_TITLE)) ??
    (await usersRepo.insertSpace(tx, user.id, DEFAULT_SPACE_TITLE)).id;

  // Fires add_owner_membership -> log_member_activity, which reads
  // app.actor_id, so the caller must run this inside withActor.
  const board = await usersRepo.insertBoard(tx, {
    ownerId: user.id,
    title: DEFAULT_BOARD_TITLE,
    spaceId,
  });

  await usersRepo.insertDefaultColumns(tx, board.id);

  return board.id;
}
