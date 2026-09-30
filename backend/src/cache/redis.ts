import { createClient } from "redis";

import type { CacheStore } from "./cache.js";

// A Redis that is up but not answering costs a request this long at most
// before it falls back to PostgreSQL.
const COMMAND_TIMEOUT_MS = 500;
const CONNECT_TIMEOUT_MS = 2_000;

export interface RedisStore extends CacheStore {
  close(): Promise<void>;
}

function hostOf(url: string): string {
  const { hostname, port } = new URL(url);

  return `${hostname}:${port || "6379"}`;
}

export function createRedisStore(url: string): RedisStore {
  const client = createClient({
    url,
    // Rejects a command sent while disconnected instead of queueing it until
    // the reconnect, which would make the request wait for Redis too.
    disableOfflineQueue: true,
    commandOptions: { timeout: COMMAND_TIMEOUT_MS },
    socket: { connectTimeout: CONNECT_TIMEOUT_MS },
  });

  let lastError: string | null = null;

  // Without an "error" listener the client throws, and Redis going down would
  // take the API with it. It emits once per reconnect attempt, so an outage is
  // logged once rather than several times a second.
  client.on("error", (error: NodeJS.ErrnoException) => {
    // A refused connection to "localhost" is an AggregateError over IPv4 and
    // IPv6 with an empty message; its code is the useful part.
    const message = error.message || error.code || error.name;

    if (message === lastError) return;

    lastError = message;
    console.error(`[redis] ${message}`);
  });

  client.on("ready", () => {
    lastError = null;
    console.log(`[redis] connected to ${hostOf(url)}`);
  });

  // Not awaited: connect() retries until Redis is reachable and only then
  // settles, and the API must serve from PostgreSQL in the meantime.
  client.connect().catch(() => {});

  return {
    isReady: () => client.isReady,
    get: (key) => client.get(key),
    async set(key, value, ttlSeconds) {
      await client.set(key, value, { EX: ttlSeconds });
    },
    async del(keys) {
      await client.del(keys);
    },
    async close() {
      if (client.isReady) {
        await client.close();
      } else if (client.isOpen) {
        client.destroy();
      }
    },
  };
}
