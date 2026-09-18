import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { sha256 } from "../lib/tokens.js";
import * as invitesRepo from "../modules/invites/invites.repo.js";
import * as membersRepo from "../modules/members/members.repo.js";
import { disconnect, resetDatabase } from "./db.js";
import { addMember, makeUser } from "./fixtures.js";

beforeEach(resetDatabase);

afterAll(disconnect);

// Two concurrent HTTP requests do NOT reliably prove a row lock: over a pool
// they usually serialise on their own, so the end-to-end test passes whether
// or not FOR UPDATE is there — verified by removing the lock and watching it
// still pass. This asserts the lock directly instead: hold it in one
// transaction and require a second one to block until the first commits.
async function expectSecondLockerToBlock(
  lock: (tx: Parameters<typeof invitesRepo.lockById>[0]) => Promise<unknown>,
): Promise<void> {
  let releaseHolder: (() => void) | undefined;
  const holderMayFinish = new Promise<void>((resolve) => {
    releaseHolder = resolve;
  });

  let acquired = false;
  const holder = prisma.$transaction(async (tx) => {
    await lock(tx);
    acquired = true;
    await holderMayFinish;
  });

  try {
    while (!acquired) await new Promise((resolve) => setImmediate(resolve));

    const contender = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`set local lock_timeout = '400ms'`;
      await lock(tx);

      return "acquired without waiting";
    });

    await expect(contender).rejects.toThrow();
  } finally {
    releaseHolder!();
    await holder;
  }
}

describe("board_invites row lock", () => {
  it("blocks a second locker, which is what stops two accepts of one link", async () => {
    const owner = await makeUser("owner");
    const token = "a-token-for-the-lock-test";

    await prisma.board_invites.create({
      data: {
        board_id: owner.boardId,
        token_hash: sha256(token),
        role: "viewer",
        expires_at: new Date(Date.now() + 86_400_000),
        created_by: owner.id,
      },
    });

    await expectSecondLockerToBlock((tx) => invitesRepo.lockByTokenHash(tx, sha256(token)));
  });

  it("blocks a second locker when the invite is named by id", async () => {
    const owner = await makeUser("owner");

    const invite = await prisma.board_invites.create({
      data: {
        board_id: owner.boardId,
        token_hash: sha256("another-token"),
        role: "viewer",
        expires_at: new Date(Date.now() + 86_400_000),
        created_by: owner.id,
      },
      select: { id: true },
    });

    await expectSecondLockerToBlock((tx) => invitesRepo.lockById(tx, invite.id));
  });
});

describe("board_members row lock", () => {
  it("blocks a second locker, so a role decision cannot be taken on a stale rank", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "viewer", owner.id);

    await expectSecondLockerToBlock((tx) =>
      membersRepo.lockMembership(tx, owner.boardId, member.id),
    );
  });
});
