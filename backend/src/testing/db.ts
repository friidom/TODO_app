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

  // Before users: a profile delete SET NULLs todos naming it and cascades its
  // boards, and Postgres refuses the interleave. See scripts/seed-demo.ts.
  await prisma.boards.deleteMany({});
  await prisma.spaces.deleteMany({});

  await prisma.users.deleteMany({});

  // admin_audit_log carries no foreign key to profiles -- deliberately, since
  // 'on delete set null' is a write and the table refuses those -- so nothing
  // cascades into it and it would otherwise accumulate across every file.
  // TRUNCATE rather than DELETE because the append-only trigger is FOR EACH
  // ROW: truncating is a table-level operation that never sees a row, which
  // is the escape hatch the harness needs and an application never reaches.
  await prisma.$executeRawUnsafe("truncate table admin_audit_log");

  // kpi_targets is seeded by 0014 and is migrated state rather than fixture
  // data, so a reset restores it. A test that empties it (to prove the
  // factual metrics survive an unconfigured KPI) must not leave every later
  // test without targets.
  await prisma.$executeRawUnsafe(`
    insert into kpi_targets (seniority, daily_points, weekly_points) values
      ('junior', 6, 30), ('middle', 8, 40), ('senior', 10, 50)
    on conflict (seniority) do update
      set daily_points = excluded.daily_points,
          weekly_points = excluded.weekly_points,
          updated_at = now(),
          updated_by = null
  `);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
