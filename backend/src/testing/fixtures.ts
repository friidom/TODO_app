import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma.js";
import { withActor } from "../db/withActor.js";
import type { BoardRole } from "../lib/permissions.js";
import { signAccessToken } from "../lib/tokens.js";
import { provisionUser } from "../modules/users/users.service.js";

export interface TestUser {
  id: string;
  email: string;
  username: string;
  // Provisioning gives every account one board; most tests need no other.
  boardId: string;
  token: string;
}

// Built through provisionUser rather than raw inserts, so a fixture account
// has the board, space, four columns and owner membership a real one has —
// and so a change to provisioning shows up here instead of drifting.
export async function makeUser(name = "user"): Promise<TestUser> {
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const email = `${name}-${suffix}@test.invalid`;
  const username = `${name}_${suffix}`.toLowerCase().replace(/[^a-z0-9_]/g, "");

  await withActor(id, async (tx) => {
    await tx.users.create({ data: { id, email, password_hash: "not-a-real-hash" } });
    await provisionUser(tx, { id, email, username });
  });

  const board = await prisma.boards.findFirstOrThrow({
    where: { owner_id: id },
    select: { id: true },
  });

  const profile = await prisma.profiles.findUniqueOrThrow({
    where: { id },
    select: { username: true },
  });

  return { id, email, username: profile.username, boardId: board.id, token: signAccessToken(id).accessToken };
}

export async function addMember(
  boardId: string,
  user: TestUser,
  role: BoardRole,
  actorId = user.id,
): Promise<void> {
  await withActor(actorId, (tx) =>
    tx.board_members.create({ data: { board_id: boardId, user_id: user.id, role } }),
  );
}

export function firstColumnOf(boardId: string): Promise<{ id: string }> {
  return prisma.columns.findFirstOrThrow({
    where: { board_id: boardId },
    orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { position: "asc" }],
    select: { id: true },
  });
}
