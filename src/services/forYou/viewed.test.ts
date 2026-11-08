import { describe, expect, it } from "vitest";

import {
  BOARD_VISITS_LIMIT,
  VIEWED_LIMIT,
  clearViewed,
  readBoardVisits,
  readViewed,
  recordBoardVisit,
  recordView,
} from "./viewed";

const U = "u-1";

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

    const list = recordView(U, "t-1", "b-1", "2026-08-21T09:00:00Z", storage);

    expect(list).toEqual([
      { id: "t-1", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
    ]);
    expect(readViewed(U, storage)).toEqual(list);
  });

  it("puts the newest view first", () => {
    const storage = memoryStorage();

    recordView(U, "t-1", "b-1", "2026-08-21T09:00:00Z", storage);
    recordView(U, "t-2", "b-1", "2026-08-21T10:00:00Z", storage);

    expect(readViewed(U, storage).map((entry) => entry.id)).toEqual([
      "t-2",
      "t-1",
    ]);
  });

  it("MOVES rather than duplicates when the same item is reopened", () => {
    const storage = memoryStorage();

    recordView(U, "t-1", "b-1", "2026-08-21T09:00:00Z", storage);
    recordView(U, "t-2", "b-1", "2026-08-21T10:00:00Z", storage);
    recordView(U, "t-1", "b-1", "2026-08-21T11:00:00Z", storage);

    const list = readViewed(U, storage);

    expect(list.map((entry) => entry.id)).toEqual(["t-1", "t-2"]);
    expect(list[0].at).toBe("2026-08-21T11:00:00Z");
  });

  it("caps the list, so the stored value cannot grow without bound", () => {
    const storage = memoryStorage();

    for (let i = 0; i < VIEWED_LIMIT + 20; i += 1) {
      recordView(U, `t-${i}`, "b-1", `2026-08-21T09:${String(i % 60).padStart(2, "0")}:00Z`, storage);
    }

    const list = readViewed(U, storage);

    expect(list).toHaveLength(VIEWED_LIMIT);
    expect(list[0].id).toBe(`t-${VIEWED_LIMIT + 19}`);
    expect(list.some((entry) => entry.id === "t-0")).toBe(false);
  });
});

describe("reading a store that cannot be trusted", () => {
  it("is empty when nothing has been viewed", () => {
    expect(readViewed(U, memoryStorage())).toEqual([]);
  });

  it("is empty when there is no store at all", () => {
    expect(readViewed(U, null)).toEqual([]);
    expect(() => recordView(U, "t-1", "b-1", "2026-08-21T09:00:00Z", null)).not.toThrow();
  });

  it("survives a store that throws on every access", () => {
    const storage = hostileStorage();

    expect(readViewed(U, storage)).toEqual([]);
    expect(() =>
      recordView(U, "t-1", "b-1", "2026-08-21T09:00:00Z", storage),
    ).not.toThrow();
    expect(() => clearViewed(U, storage)).not.toThrow();
  });

  it("survives a hand-edited value", () => {
    expect(readViewed(U, memoryStorage({ "kan:viewed:u-1": "{{{" }))).toEqual([]);
    expect(readViewed(U, memoryStorage({ "kan:viewed:u-1": '"a string"' }))).toEqual([]);
    expect(readViewed(U, memoryStorage({ "kan:viewed:u-1": "null" }))).toEqual([]);
  });

  it("drops malformed entries but keeps the sound ones", () => {
    const storage = memoryStorage({
      "kan:viewed:u-1": JSON.stringify([
        { id: "t-1", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        { id: 42, boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        { boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        { id: "", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
        null,
        "nope",
      ]),
    });

    expect(readViewed(U, storage)).toEqual([
      { id: "t-1", boardId: "b-1", at: "2026-08-21T09:00:00Z" },
    ]);
  });

  it("stores IDS ONLY, never titles", () => {
    // resolving an id back to a title always goes through RLS — nothing renderable is stored for an item you've lost access to
    const storage = memoryStorage();

    recordView(U, "t-1", "b-1", "2026-08-21T09:00:00Z", storage);

    const raw = storage.getItem("kan:viewed:u-1")!;

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

    recordView(U, "t-1", "b-1", "2026-08-21T09:00:00Z", storage);
    clearViewed(U, storage);

    expect(readViewed(U, storage)).toEqual([]);
  });
});

describe("board visits", () => {
  it("moves a revisited board to the front instead of listing it twice", () => {
    const storage = memoryStorage();

    recordBoardVisit(U, "a", "2026-08-01T00:00:00Z", undefined, storage);
    recordBoardVisit(U, "b", "2026-08-02T00:00:00Z", undefined, storage);

    const visits = recordBoardVisit(U, "a", "2026-08-03T00:00:00Z", undefined, storage);

    expect(visits.map((visit) => visit.id)).toEqual(["a", "b"]);
    expect(readBoardVisits(U, storage)).toEqual(visits);
  });

  it("keeps only the most recent visits", () => {
    const storage = memoryStorage();

    for (let index = 0; index < BOARD_VISITS_LIMIT + 3; index += 1) {
      recordBoardVisit(
        U,
        `b-${index}`,
        `2026-08-01T00:00:0${index % 10}Z`,
        undefined,
        storage,
      );
    }

    const visits = readBoardVisits(U, storage);

    expect(visits).toHaveLength(BOARD_VISITS_LIMIT);
    expect(visits[0]!.id).toBe(`b-${BOARD_VISITS_LIMIT + 2}`);
  });

  it("drops malformed entries and survives a browser that refuses storage", () => {
    expect(
      readBoardVisits(U, memoryStorage({ "kan:recent-boards:u-1": "{not json" })),
    ).toEqual([]);
    expect(
      readBoardVisits(U, 
        memoryStorage({
          "kan:recent-boards:u-1": JSON.stringify([
            { id: 1 },
            { id: "ok", at: "2026-08-01T00:00:00Z" },
          ]),
        }),
      ),
    ).toEqual([{ id: "ok", at: "2026-08-01T00:00:00Z" }]);
    expect(readBoardVisits(U, hostileStorage())).toEqual([]);
    expect(() =>
      recordBoardVisit(U, "a", "2026-08-01T00:00:00Z", undefined, hostileStorage()),
    ).not.toThrow();
  });
});

describe("per-user scoping", () => {
  it("keeps one person's history out of another's", () => {
    const storage = memoryStorage();

    recordView("u-1", "t-1", "b-1", "2026-08-21T09:00:00Z", storage);
    recordBoardVisit("u-1", "b-1", "2026-08-21T09:00:00Z", "list", storage);

    expect(readViewed("u-2", storage)).toEqual([]);
    expect(readBoardVisits("u-2", storage)).toEqual([]);
    expect(readBoardVisits("u-1", storage)).toEqual([
      { id: "b-1", at: "2026-08-21T09:00:00Z", view: "list" },
    ]);
  });

  it("records and reads nothing without a user", () => {
    const storage = memoryStorage();

    expect(recordView(undefined, "t-1", "b-1", "2026-08-21T09:00:00Z", storage)).toEqual([]);
    expect(readViewed(undefined, storage)).toEqual([]);
    expect(storage.length).toBe(0);
  });

  it("removes the old browser-wide keys", () => {
    const storage = memoryStorage({
      "kan:viewed": JSON.stringify([{ id: "t-1", boardId: "b-1", at: "x" }]),
      "kan:recent-boards": JSON.stringify([{ id: "b-1", at: "x" }]),
    });

    expect(readViewed("u-1", storage)).toEqual([]);
    expect(storage.getItem("kan:viewed")).toBeNull();
    expect(storage.getItem("kan:recent-boards")).toBeNull();
  });

  it("drops a visit whose view is not text", () => {
    const storage = memoryStorage({
      "kan:recent-boards:u-1": JSON.stringify([
        { id: "a", at: "x", view: 3 },
        { id: "b", at: "x" },
      ]),
    });

    expect(readBoardVisits("u-1", storage)).toEqual([{ id: "b", at: "x" }]);
  });
});
