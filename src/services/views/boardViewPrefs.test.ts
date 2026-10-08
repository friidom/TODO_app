import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_BOARD_VIEW_PREFS,
  DEFAULT_CARD_FIELDS,
  hideStaleDone,
  isDefaultBoardViewPrefs,
  normalizeBoardViewPrefs,
  readBoardViewPrefs,
  toggleCardField,
  writeBoardViewPrefs,
  type BoardViewPrefs,
} from "./boardViewPrefs";
import type { Todo } from "@/types/data";

const prefs = (over: Partial<BoardViewPrefs>): BoardViewPrefs => ({
  ...DEFAULT_BOARD_VIEW_PREFS,
  cardFields: [...DEFAULT_CARD_FIELDS],
  ...over,
});

describe("normalizeBoardViewPrefs", () => {
  it("keeps valid choices as they are", () => {
    const choice = prefs({
      columnSize: "flexible",
      scroll: "board",
      hideDoneAfter: 14,
      cardFields: ["summary", "assignee"],
    });

    expect(normalizeBoardViewPrefs(choice)).toEqual(choice);
  });

  it("repairs each field on its own", () => {
    expect(
      normalizeBoardViewPrefs({ columnSize: "huge", scroll: "board" }),
    ).toEqual(prefs({ scroll: "board" }));

    expect(
      normalizeBoardViewPrefs({ columnSize: "flexible", scroll: 3 }),
    ).toEqual(prefs({ columnSize: "flexible" }));
  });

  it("answers the default for anything that is not an object", () => {
    for (const junk of [null, undefined, "flexible", 7, []]) {
      expect(normalizeBoardViewPrefs(junk)).toEqual(DEFAULT_BOARD_VIEW_PREFS);
    }
  });

  it("only accepts the offered hide-done durations", () => {
    for (const junk of [0, 2, -7, "14", 14.5, null]) {
      expect(
        normalizeBoardViewPrefs({ hideDoneAfter: junk }).hideDoneAfter,
      ).toBe(null);
    }

    expect(normalizeBoardViewPrefs({ hideDoneAfter: 30 }).hideDoneAfter).toBe(
      30,
    );
  });

  it("drops unknown card fields, dedupes, and keeps the card's own order", () => {
    expect(
      normalizeBoardViewPrefs({
        cardFields: ["assignee", "labels", "summary", "assignee", 4],
      }).cardFields,
    ).toEqual(["summary", "assignee"]);
  });

  it("keeps an emptied field list empty instead of restoring the defaults", () => {
    expect(normalizeBoardViewPrefs({ cardFields: [] }).cardFields).toEqual([]);
  });
});

describe("toggleCardField", () => {
  it("removes a shown field and adds a hidden one back in its place", () => {
    expect(toggleCardField(["summary", "key", "assignee"], "key")).toEqual([
      "summary",
      "assignee",
    ]);

    expect(toggleCardField(["summary", "assignee"], "key")).toEqual([
      "summary",
      "key",
      "assignee",
    ]);
  });

  it("does not mutate the list it is given", () => {
    const fields = ["summary" as const];

    toggleCardField(fields, "parent");

    expect(fields).toEqual(["summary"]);
  });
});

describe("isDefaultBoardViewPrefs", () => {
  it("is true only when every choice is the default", () => {
    expect(isDefaultBoardViewPrefs(DEFAULT_BOARD_VIEW_PREFS)).toBe(true);
    expect(isDefaultBoardViewPrefs(prefs({ columnSize: "flexible" }))).toBe(
      false,
    );
    expect(isDefaultBoardViewPrefs(prefs({ scroll: "board" }))).toBe(false);
    expect(isDefaultBoardViewPrefs(prefs({ hideDoneAfter: 7 }))).toBe(false);
    expect(
      isDefaultBoardViewPrefs(
        prefs({ cardFields: DEFAULT_CARD_FIELDS.slice(1) }),
      ),
    ).toBe(false);
    expect(
      isDefaultBoardViewPrefs(
        prefs({ cardFields: [...DEFAULT_CARD_FIELDS, "parent"] }),
      ),
    ).toBe(false);
  });
});

describe("hideStaleDone", () => {
  const DONE = new Set(["st-done"]);
  const TODAY = "2026-10-09";

  const card = (over: Partial<Todo> & { id: string }): Todo =>
    ({ status_id: "st-todo", completed_at: null, ...over }) as Todo;

  const todos = [
    card({ id: "open" }),
    card({
      id: "old",
      status_id: "st-done",
      completed_at: "2026-09-01T10:00:00.000Z",
    }),
    card({
      id: "recent",
      status_id: "st-done",
      completed_at: "2026-10-08T10:00:00.000Z",
    }),
    card({ id: "unstamped", status_id: "st-done", completed_at: null }),
  ];

  it("hides nothing, and returns the same array, when set to never", () => {
    expect(hideStaleDone(todos, null, DONE, TODAY)).toBe(todos);
  });

  it("hides done work completed before the cutoff and keeps the rest", () => {
    expect(
      hideStaleDone(todos, 14, DONE, TODAY).map((todo) => todo.id),
    ).toEqual(["open", "recent", "unstamped"]);
  });

  it("counts whole days back from the start of today", () => {
    const edge = [
      card({
        id: "a",
        status_id: "st-done",
        completed_at: "2026-10-08T00:00:00.000Z",
      }),
      card({
        id: "b",
        status_id: "st-done",
        completed_at: "2026-10-07T23:59:59.000Z",
      }),
    ];

    expect(hideStaleDone(edge, 1, DONE, TODAY).map((todo) => todo.id)).toEqual([
      "a",
    ]);
  });

  it("never hides work that is not done, however old its stamp", () => {
    const reopened = [
      card({ id: "x", status_id: "st-todo", completed_at: "2020-01-01" }),
    ];

    expect(hideStaleDone(reopened, 1, DONE, TODAY)).toBe(reopened);
  });
});

describe("storage", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  it("round-trips a choice", () => {
    const choice = prefs({
      columnSize: "flexible",
      scroll: "board",
      hideDoneAfter: 7,
      cardFields: ["summary", "parent"],
    });

    writeBoardViewPrefs(choice);

    expect(readBoardViewPrefs()).toEqual(choice);
  });

  it("removes the entry once the choice is back to the default", () => {
    writeBoardViewPrefs(prefs({ columnSize: "flexible" }));
    expect(store["board:view-prefs"]).toBeDefined();

    writeBoardViewPrefs(DEFAULT_BOARD_VIEW_PREFS);
    expect(store["board:view-prefs"]).toBeUndefined();
    expect(readBoardViewPrefs()).toEqual(DEFAULT_BOARD_VIEW_PREFS);
  });

  it("reads an entry written before hide-done and card fields existed", () => {
    store["board:view-prefs"] = JSON.stringify({
      columnSize: "flexible",
      scroll: "columns",
    });

    expect(readBoardViewPrefs()).toEqual(prefs({ columnSize: "flexible" }));
  });

  it("falls back to the default rather than throwing on unreadable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readBoardViewPrefs()).toEqual(DEFAULT_BOARD_VIEW_PREFS);
    expect(() =>
      writeBoardViewPrefs(prefs({ columnSize: "flexible" })),
    ).not.toThrow();
  });

  it("falls back to the default on a corrupt entry", () => {
    store["board:view-prefs"] = "{not json";

    expect(readBoardViewPrefs()).toEqual(DEFAULT_BOARD_VIEW_PREFS);
  });
});
