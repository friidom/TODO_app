import type { Response } from "express";

import { env } from "../config/env.js";
import { createRedisStore, type RedisStore } from "./redis.js";

export interface CacheStore {
  isReady(): boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
}

export interface CacheEntry {
  key: string;
  ttlSeconds: number;
}

export type CacheOutcome = "HIT" | "MISS";

const stats = { hits: 0, misses: 0, errors: 0 };

let store: CacheStore | null = null;
let redis: RedisStore | null = null;

export function connectCache(): void {
  if (env.REDIS_URL === undefined) {
    console.log("[cache] REDIS_URL is not set: caching is off, every read goes to PostgreSQL");

    return;
  }

  redis = createRedisStore(env.REDIS_URL);
  store = redis;
}

export async function disconnectCache(): Promise<void> {
  await redis?.close();

  redis = null;
  store = null;
}

export function setCacheStore(next: CacheStore | null): void {
  store = next;
}

export function cacheHealth() {
  return {
    status: store === null ? "disabled" : store.isReady() ? "up" : "down",
    ...stats,
  };
}

function debug(event: string, detail: string): void {
  if (env.CACHE_DEBUG) console.log(`[cache] ${event} ${detail}`);
}

// Every Redis call goes through here, and none of them can fail a request: a
// failure is counted and the caller carries on as if the cache were empty.
async function attempt<T>(
  command: string,
  detail: string,
  run: (store: CacheStore) => Promise<T>,
): Promise<T | undefined> {
  if (store === null) return undefined;

  try {
    return await run(store);
  } catch (error) {
    stats.errors += 1;
    debug(`${command} failed`, `${detail}: ${error instanceof Error ? error.message : String(error)}`);

    return undefined;
  }
}

// The stored value is the response body itself, so a HIT sends exactly the
// bytes the MISS sent. A load that throws stores nothing: errors and failed
// responses are never cached.
export async function cacheAside(
  entry: CacheEntry,
  load: () => Promise<unknown>,
): Promise<{ body: string; outcome: CacheOutcome }> {
  const cached = await attempt("GET", entry.key, (s) => s.get(entry.key));

  if (typeof cached === "string") {
    stats.hits += 1;
    debug("HIT", entry.key);

    return { body: cached, outcome: "HIT" };
  }

  stats.misses += 1;
  debug("MISS", entry.key);

  const body = JSON.stringify(await load());

  await attempt("SET", entry.key, (s) => s.set(entry.key, body, entry.ttlSeconds));

  return { body, outcome: "MISS" };
}

export async function sendCached(
  res: Response,
  entry: CacheEntry,
  load: () => Promise<unknown>,
): Promise<void> {
  const { body, outcome } = await cacheAside(entry, load);

  res.set("X-Cache", outcome).type("json").send(body);
}

export async function invalidate(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const deleted = await attempt("DEL", keys.join(" "), async (s) => {
    await s.del(keys);

    return true;
  });

  if (deleted) debug("DEL", keys.join(" "));
}
