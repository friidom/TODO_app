import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryCacheStore } from "../testing/memoryCache.js";
import { setCacheStore } from "./cache.js";
import { boardCache, EVERY_BOARD_PART, invalidateBoard } from "./keys.js";

const BOARD_A = "0f6f6b1e-7c2a-4d7e-9a57-1f0c2b3d4e5a";
const BOARD_B = "5a4e3d2b-0c1f-4a7e-8d2c-e1b6f6f0a9b8";

let store: MemoryCacheStore;

beforeEach(() => {
  store = new MemoryCacheStore();
  setCacheStore(store);
});

afterEach(() => setCacheStore(null));

describe("boardCache", () => {
  it("names the board in every key, so two boards never share an entry", () => {
    for (const part of EVERY_BOARD_PART) {
      expect(boardCache[part](BOARD_A).key).toContain(BOARD_A);
      expect(boardCache[part](BOARD_A).key).not.toBe(boardCache[part](BOARD_B).key);
    }
  });

  it("gives every part of a board its own key", () => {
    const keys = EVERY_BOARD_PART.map((part) => boardCache[part](BOARD_A).key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("expires every entry within a minute", () => {
    for (const part of EVERY_BOARD_PART) {
      const { ttlSeconds } = boardCache[part](BOARD_A);

      expect(ttlSeconds).toBeGreaterThan(0);
      expect(ttlSeconds).toBeLessThanOrEqual(60);
    }
  });
});

describe("invalidateBoard", () => {
  it("deletes the named parts of that board and nothing else", async () => {
    for (const board of [BOARD_A, BOARD_B]) {
      for (const part of EVERY_BOARD_PART) {
        await store.set(boardCache[part](board).key, "[]", 10);
      }
    }

    await invalidateBoard(BOARD_A, ["todos", "activities"]);

    const remaining = [...store.entries.keys()];

    expect(remaining).not.toContain(boardCache.todos(BOARD_A).key);
    expect(remaining).not.toContain(boardCache.activities(BOARD_A).key);
    expect(remaining).toContain(boardCache.workflow(BOARD_A).key);
    expect(remaining).toContain(boardCache.todos(BOARD_B).key);
    expect(remaining).toHaveLength(EVERY_BOARD_PART.length * 2 - 2);
  });
});
