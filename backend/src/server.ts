import { app } from "./app.js";
import { describeDatabase, env } from "./config/env.js";
import { closePool, describeError, ping } from "./db/client.js";
import { prisma } from "./db/prisma.js";

const server = app.listen(env.PORT, async () => {
  console.log(
    `[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
  );
  console.log(`[api] health check: http://localhost:${env.PORT}/health`);

  // reports but does not exit: a database that is merely slow to start should
  // not stop the API coming up, and /health tells the truth either way
  try {
    const { database } = await ping();

    console.log(`[db] connected to ${describeDatabase()} (${database})`);
  } catch (error) {
    console.error(`[db] NOT connected to ${describeDatabase()}`);
    console.error(`[db] ${describeError(error)}`);
  }
});

function shutdown(signal: string) {
  console.log(`\n[api] ${signal} received, shutting down…`);

  server.close(async () => {
    // before closePool: Prisma borrows from that pool, so ending it first
    // would pull the connection out from under an in-flight query
    await prisma.$disconnect();
    await closePool();
    console.log("[api] closed");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
