import { describeDatabase } from "../config/env.js";
import { closePool, describeError, ping } from "./client.js";
import { prisma } from "./prisma.js";

try {
  let reachable = false;

  try {
    const { version, database } = await ping();

    reachable = true;

    console.log(`[db] connected to ${describeDatabase()}`);
    console.log(`[db] database: ${database}`);
    console.log(`[db] ${version.split(" on ")[0]}`);
  } catch (error) {
    console.error(`[db] could not connect to ${describeDatabase()}`);
    console.error(`[db] ${describeError(error)}`);
    process.exitCode = 1;
  }

  // Skipped when the pool could not connect: Prisma shares that pool, so it
  // would only restate the same failure in a less readable form.
  if (reachable) {
    try {
      const [row] = await prisma.$queryRaw<
        { db: string }[]
      >`select current_database() as db`;

      const users = await prisma.users.count();
      const boards = await prisma.boards.count();
      const todos = await prisma.todos.count();

      console.log(`[prisma] raw query ok — current_database() = ${row?.db}`);
      console.log(
        `[prisma] model query ok — users=${users} boards=${boards} todos=${todos}`,
      );
    } catch (error) {
      console.error("[prisma] query failed");
      console.error(`[prisma] ${describeError(error)}`);
      process.exitCode = 1;
    }
  }
} finally {
  await prisma.$disconnect();
  await closePool();
}
