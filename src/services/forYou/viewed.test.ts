import { describe, expect, it } from "vitest";

import {
  VIEWED_LIMIT,
  clearViewed,
  readViewed,
  recordView,
} from "./viewed";

/**
 * A `Storage` that lives in a variable.
 *
 * `viewed.ts` takes its store as an argument precisely so the boundary cases
 * below — a hostile value, a throwing store, a full quota — are testable
 * without a browser, which is what keeps this suite in the `node` environment
 * the rest of the project uses.
 */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));

  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

/** A store that refuses everything — a private window, or a full quota. */
function hostileStorage(): Storage {
  return {
    get length(): number {
      throw new Error("denied");
    },
    clear: () => {
      throw new Error("denied");
    },
    getItem: () => {
      throw new Error("denied");
    },
    key: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
}

describe("recording a view", () => {
  it("records the work item, its board and when", () => {
    const storage = memoryStorage();

    const list = recordView("t-1", "b-1", "2026-08-21T09:00:00Z", storage);

    expect(list).toEqual([
      { id: "t-1", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
    ]);
    expect(readViewed(storage)).toEqual(list);
  });

  it("puts the newest view first", () => {
    const storage = memoryStorage();

    recordView("t-1", "b-1", "2026-08-21T09:00:00Z", storage);
    recordView("t-2", "b-1", "2026-08-21T10:00:00Z", storage);

    expect(readViewed(storage).map((entry) => entry.id)).toEqual([
      "t-2",
      "t-1",
    ]);
  });

  it("MOVES rather than duplicates when the same item is reopened", () => {
    // What keeps the list a set of work items ordered by recency instead of a
    // log of navigations — and why the cap can be as small as it is.
    const storage = memoryStorage();

    recordView("t-1", "b-1", "2026-08-21T09:00:00Z", storage);
    recordView("t-2", "b-1", "2026-08-21T10:00:00Z", storage);
    recordView("t-1", "b-1", "2026-08-21T11:00:00Z", storage);

    const list = readViewed(storage);

    expect(list.map((entry) => entry.id)).toEqual(["t-1", "t-2"]);
    expect(list[0].at).toBe("2026-08-21T11:00:00Z");
  });

  it("caps the list, so the stored value cannot grow without bound", () => {
    const storage = memoryStorage();

    for (let i = 0; i < VIEWED_LIMIT + 20; i += 1) {
      recordView(`t-${i}`, "b-1", `2026-08-21T09:${String(i % 60).padStart(2, "0")}:00Z`, storage);
    }

    const list = readViewed(storage);

    expect(list).toHaveLength(VIEWED_LIMIT);
    // The most recent survives and the oldest is gone.
    expect(list[0].id).toBe(`t-${VIEWED_LIMIT + 19}`);
    expect(list.some((entry) => entry.id === "t-0")).toBe(false);
  });
});

describe("reading a store that cannot be trusted", () => {
  it("is empty when nothing has been viewed", () => {
    expect(readViewed(memoryStorage())).toEqual([]);
  });

  it("is empty when there is no store at all", () => {
    // SSR, or a browser with storage disabled. Not an error to surface.
    expect(readViewed(null)).toEqual([]);
    expect(() => recordView("t-1", "b-1", "2026-08-21T09:00:00Z", null)).not.toThrow();
  });

  it("survives a store that throws on every access", () => {
    const storage = hostileStorage();

    expect(readViewed(storage)).toEqual([]);
    // A view that could not be saved is worth nothing next to the task the
    // user was actually opening, so the write is swallowed rather than thrown.
    expect(() =>
      recordView("t-1", "b-1", "2026-08-21T09:00:00Z", storage),
    ).not.toThrow();
    expect(() => clearViewed(storage)).not.toThrow();
  });

  it("survives a hand-edited value", () => {
    // This is the user's own browser, so the value is user-writable. Garbage
    // must produce an empty list, never a crash on an unrelated page.
    expect(readViewed(memoryStorage({ "kan:viewed": "{{{" }))).toEqual([]);
    expect(readViewed(memoryStorage({ "kan:viewed": '"a string"' }))).toEqual([]);
    expect(readViewed(memoryStorage({ "kan:viewed": "null" }))).toEqual([]);
  });

  it("drops malformed entries but keeps the sound ones", () => {
    const storage = memoryStorage({
      "kan:viewed": JSON.stringify([
        { id: "t-1", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        { id: 42, boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        { boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        { id: "", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        null,
        "nope",
      ]),
    });

    expect(readViewed(storage)).toEqual([
      { id: "t-1", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
    ]);
  });

  it("stores IDS ONLY, never titles", () => {
    // The rule that keeps local storage stale-but-never-leaky: a work item you
    // have lost access to has nothing here to render, because resolving an id
    // goes back through RLS.
    const storage = memoryStorage();

    recordView("t-1", "b-1", "2026-08-21T09:00:00Z", storage);

    const raw = storage.getItem("kan:viewed")!;

    expect(raw).toContain("t-1");
    expect(Object.keys(JSON.parse(raw)[0]).sort()).toEqual([
      "at",
      "boardId",
      "id",
    ]);
  });
});

describe("clearing", () => {
  it("forgets everything", () => {
    const storage = memoryStorage();

    recordView("t-1", "b-1", "2026-08-21T09:00:00Z", storage);
    clearViewed(storage);

    expect(readViewed(storage)).toEqual([]);
  });
});
