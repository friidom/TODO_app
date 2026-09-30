import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryCacheStore, unavailableStore } from "../testing/memoryCache.js";
import { cacheAside, cacheHealth, invalidate, setCacheStore } from "./cache.js";

const entry = { key: "todo-app:todos:board:1", ttlSeconds: 15 };

let store: MemoryCacheStore;

beforeEach(() => {
  store = new MemoryCacheStore();
  setCacheStore(store);
});

afterEach(() => setCacheStore(null));

describe("cacheAside", () => {
  it("loads on a miss and stores the serialised body with the entry's TTL", async () => {
    const load = vi.fn(async () => [{ id: 1, created_at: new Date("2026-01-01T00:00:00Z") }]);

    const result = await cacheAside(entry, load);

    expect(result.outcome).toBe("MISS");
    expect(load).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.body)).toEqual([{ id: 1, created_at: "2026-01-01T00:00:00.000Z" }]);
    expect(store.entries.get(entry.key)).toEqual({ value: result.body, ttlSeconds: 15 });
  });

  it("serves the stored body on a hit without loading", async () => {
    const first = await cacheAside(entry, async () => ["from the database"]);
    const load = vi.fn(async () => ["loaded again"]);

    const second = await cacheAside(entry, load);

    expect(second).toEqual({ body: first.body, outcome: "HIT" });
    expect(load).not.toHaveBeenCalled();
  });

  it("stores nothing when the load fails, so the next read tries again", async () => {
    await expect(
      cacheAside(entry, async () => {
        throw new Error("database down");
      }),
    ).rejects.toThrow("database down");

    expect(store.entries.has(entry.key)).toBe(false);

    const retry = await cacheAside(entry, async () => ["recovered"]);

    expect(retry).toEqual({ body: JSON.stringify(["recovered"]), outcome: "MISS" });
  });

  it("loads again once its key is invalidated", async () => {
    await cacheAside(entry, async () => ["old"]);
    await invalidate([entry.key]);

    const fresh = await cacheAside(entry, async () => ["new"]);

    expect(fresh).toEqual({ body: JSON.stringify(["new"]), outcome: "MISS" });
  });

  it("falls back to the load when Redis is unavailable, and counts the failures", async () => {
    setCacheStore(unavailableStore);
    const errorsBefore = cacheHealth().errors;

    const result = await cacheAside(entry, async () => ["from the database"]);

    expect(result).toEqual({ body: JSON.stringify(["from the database"]), outcome: "MISS" });
    expect(cacheHealth()).toMatchObject({ status: "down", errors: errorsBefore + 2 });
  });

  it("still answers when only the write to Redis fails", async () => {
    setCacheStore({
      isReady: () => true,
      get: async () => null,
      set: () => Promise.reject(new Error("timeout")),
      del: async () => {},
    });

    const result = await cacheAside(entry, async () => ["from the database"]);

    expect(result.outcome).toBe("MISS");
    expect(JSON.parse(result.body)).toEqual(["from the database"]);
  });

  it("loads every time while caching is off", async () => {
    setCacheStore(null);
    const load = vi.fn(async () => ["from the database"]);

    await cacheAside(entry, load);
    await cacheAside(entry, load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(cacheHealth().status).toBe("disabled");
  });
});

describe("invalidate", () => {
  it("deletes exactly the keys it is given", async () => {
    await store.set("todo-app:a", "1", 10);
    await store.set("todo-app:b", "2", 10);

    await invalidate(["todo-app:a"]);

    expect([...store.entries.keys()]).toEqual(["todo-app:b"]);
  });

  it("never throws, even when Redis is unavailable", async () => {
    setCacheStore(unavailableStore);

    await expect(invalidate(["todo-app:a"])).resolves.toBeUndefined();
  });
});
