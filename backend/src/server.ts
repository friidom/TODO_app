import { createServer } from "node:http";

import { app } from "./app.js";
import { describeDatabase, env } from "./config/env.js";
import { closePool, describeError, ping } from "./db/client.js";
import { prisma } from "./db/prisma.js";
import { createRealtimeServer } from "./realtime/io.js";
import { avatarStorage, minioStorage } from "./infrastructure/storage/minio-storage.js";

// Explicit, because Socket.IO needs the http.Server itself — app.listen()
// creates one and returns it, but only after it is already bound.
const server = createServer(app);

const io = createRealtimeServer(server);

server.listen(env.PORT, async () => {
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

  try {
    await minioStorage.ensureBucket();
    await avatarStorage.ensureBucket();

    console.log(
      `[minio] connected, buckets "${env.MINIO_BUCKET}" and "${env.MINIO_AVATAR_BUCKET}" are ready`,
    );
  } catch (error) {
    console.error(`[minio] NOT connected to ${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`);
    console.error(error);
  }
});

function shutdown(signal: string) {
  console.log(`\n[api] ${signal} received, shutting down…`);

  // io.close() disconnects every socket and closes the HTTP server it is
  // attached to, so it replaces server.close() rather than preceding it —
  // calling both raises ERR_SERVER_NOT_RUNNING.
  io.close(async () => {
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
