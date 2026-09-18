import { prisma } from "../db/prisma.js";

// The suite empties every table, so it must never be pointed at development.
// vitest.integration.config.ts checks the URL; this checks what the connection
// actually opened, which is the claim that matters.
async function assertTestDatabase(): Promise<void> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`select current_database() as name`;
  const name = rows[0]?.name;

  if (name === undefined || !name.endsWith("_test")) {
    throw new Error(
      `Refusing to run: connected to "${name}", which is not a *_test database. ` +
        "Check TEST_DATABASE_URL.",
    );
  }
}

// Deleting users is the whole reset: profiles cascade from users, and boards,
// spaces, sessions and notifications cascade from profiles. Doing it through
// the real foreign keys also means a cascade that stops working fails here
// rather than somewhere subtler (§21.11 and §21.12 were both that bug).
export async function resetDatabase(): Promise<void> {
  await assertTestDatabase();

  await prisma.users.deleteMany({});
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
