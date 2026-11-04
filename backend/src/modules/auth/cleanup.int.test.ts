import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser } from "../../testing/fixtures.js";
import { pruneDeadAuthRows } from "./auth.repo.js";

beforeEach(resetDatabase);

afterAll(disconnect);

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

async function session(userId: string, familyId: string, revokedDaysAgo: number | null, expires = ahead(10)) {
  const row = await prisma.sessions.create({
    data: {
      user_id: userId,
      family_id: familyId,
      token_hash: randomUUID(),
      expires_at: expires,
      revoked_at: revokedDaysAgo === null ? null : ago(revokedDaysAgo),
    },
    select: { id: true },
  });

  return row.id;
}

describe("pruneDeadAuthRows", () => {
  it("removes a long-dead family and keeps one that is still live", async () => {
    const user = await makeUser("u");
    const dead = randomUUID();
    const live = randomUUID();

    const deadOld = await session(user.id, dead, 45);
    const deadNewest = await session(user.id, dead, 40);
    const rotatedLongAgo = await session(user.id, live, 45);
    const current = await session(user.id, live, null);
    const recentlyRevoked = await session(user.id, randomUUID(), 5);

    await pruneDeadAuthRows(ago(30));

    const left = new Set((await prisma.sessions.findMany({ select: { id: true } })).map((row) => row.id));

    expect(left.has(deadOld)).toBe(false);
    expect(left.has(deadNewest)).toBe(false);
    expect(left.has(rotatedLongAgo)).toBe(true);
    expect(left.has(current)).toBe(true);
    expect(left.has(recentlyRevoked)).toBe(true);
  });

  it("removes spent tokens a month old and keeps live ones", async () => {
    const user = await makeUser("u");

    await prisma.password_reset_tokens.createMany({
      data: [
        { user_id: user.id, token_hash: randomUUID(), expires_at: ago(40), used_at: null },
        { user_id: user.id, token_hash: randomUUID(), expires_at: ahead(1), used_at: ago(31) },
        { user_id: user.id, token_hash: randomUUID(), expires_at: ahead(1), used_at: null },
      ],
    });

    await pruneDeadAuthRows(ago(30));

    expect(await prisma.password_reset_tokens.count()).toBe(1);
  });
});
