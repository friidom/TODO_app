import { describe, expect, it } from "vitest";

import type { IBoard, Todo } from "@/types/data";
import {
  groupFeed,
  isForYouTab,
  mergeFeed,
  periodOf,
  toFeedItems,
  type FeedItem,
} from "./feed";

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    column_id: "c-1",
    board_key: seq,
    title: `Item ${seq}`,
    type: "Task",
    priority: null,
    start_date: null,
    due_date: null,
    assignee_id: null,
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    ...over,
  } as Todo;
}

function board(over: Partial<IBoard> = {}): IBoard {
  return {
    id: "b-1",
    title: "My Board",
    key_prefix: "KAN",
    owner_id: "u-1",
    space_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    next_key: 1,
    ...over,
  } as IBoard;
}

// Friday 21 August 2026, mid-morning, local time.
const NOW = new Date(2026, 7, 21, 10, 30);

function item(at: string, over: Partial<Todo> = {}): FeedItem {
  return { todo: todo(over), at, boardName: "My Board", key: "KAN-1" };
}

describe("tab param", () => {
  it("accepts the four real tabs and nothing else", () => {
    expect(isForYouTab("recommended")).toBe(true);
    expect(isForYouTab("assigned")).toBe(true);
    expect(isForYouTab("workedon")).toBe(true);
    expect(isForYouTab("viewed")).toBe(true);

    expect(isForYouTab("everything")).toBe(false);
    // removed tab — an old bookmark should fall back to default, not resolve to nothing
    expect(isForYouTab("starred")).toBe(false);
    expect(isForYouTab("")).toBe(false);
    expect(isForYouTab(null)).toBe(false);
  });
});

describe("building feed items", () => {
  it("names the board and assembles the key", () => {
    const [row] = toFeedItems(
      [todo({ board_key: 12 })],
      [board({ key_prefix: "OPS", title: "Ops" })],
    );

    expect(row.boardName).toBe("Ops");
    expect(row.key).toBe("OPS-12");
  });

  it("leaves the key null while a card is still in flight", () => {
    const [row] = toFeedItems([todo({ board_key: null })], [board()]);

    expect(row.key).toBeNull();
  });

  it("DROPS A ROW WHOSE BOARD THE USER CANNOT SEE", () => {
    const mine = todo({ board_id: "b-1" });
    const theirs = todo({ board_id: "b-someone-else" });

    const rows = toFeedItems([mine, theirs], [board({ id: "b-1" })]);

    expect(rows).toHaveLength(1);
    expect(rows[0].todo.id).toBe(mine.id);
  });

  it("shows nothing at all when the user has no boards", () => {
    expect(toFeedItems([todo(), todo()], [])).toEqual([]);
  });

  it("dates a row by updated_at, falling back to created_at", () => {
    const [fresh] = toFeedItems(
      [todo({ created_at: "2026-08-01T09:00:00Z", updated_at: "2026-08-20T09:00:00Z" })],
      [board()],
    );

    expect(fresh.at).toBe("2026-08-20T09:00:00Z");

    const [never] = toFeedItems(
      [todo({ created_at: "2026-08-01T09:00:00Z", updated_at: null })],
      [board()],
    );

    expect(never.at).toBe("2026-08-01T09:00:00Z");
  });

  it("takes an explicit date, which is what the worked-on/viewed tabs use", () => {
    const [row] = toFeedItems([todo()], [board()], () => "2026-08-19T12:00:00Z");

    expect(row.at).toBe("2026-08-19T12:00:00Z");
  });
});

describe("merging sources", () => {
  it("sorts newest first", () => {
    const merged = mergeFeed([
      item("2026-08-10T09:00:00Z"),
      item("2026-08-21T09:00:00Z"),
      item("2026-08-15T09:00:00Z"),
    ]);

    expect(merged.map((row) => row.at)).toEqual([
      "2026-08-21T09:00:00Z",
      "2026-08-15T09:00:00Z",
      "2026-08-10T09:00:00Z",
    ]);
  });

  it("NEVER SHOWS ONE WORK ITEM TWICE", () => {
    const shared = todo();

    const merged = mergeFeed(
      [{ todo: shared, at: "2026-08-20T09:00:00Z", boardName: "b", key: null }],
      [{ todo: shared, at: "2026-08-21T09:00:00Z", boardName: "b", key: null }],
    );

    expect(merged).toHaveLength(1);
  });

  it("keeps the FIRST source's copy, so the caller controls which reason wins", () => {
    const shared = todo();

    const merged = mergeFeed(
      [{ todo: shared, at: "2026-08-20T09:00:00Z", boardName: "b", key: null }],
      [{ todo: shared, at: "2026-08-21T09:00:00Z", boardName: "b", key: null }],
    );

    expect(merged[0].at).toBe("2026-08-20T09:00:00Z");
  });

  it("handles no sources and empty sources", () => {
    expect(mergeFeed()).toEqual([]);
    expect(mergeFeed([], [])).toEqual([]);
  });
});

describe("period boundaries", () => {
  // NOW is Friday 21 August 2026 — that week's Monday is the 17th, previous Monday the 10th.

  it("puts today in today", () => {
    expect(periodOf("2026-08-21", NOW)).toBe("today");
  });

  it("puts a future day in today rather than inventing a bucket", () => {
    expect(periodOf("2026-08-22", NOW)).toBe("today");
  });

  it("puts yesterday in yesterday", () => {
    expect(periodOf("2026-08-20", NOW)).toBe("yesterday");
  });

  it("puts the rest of this week in 'earlier this week'", () => {
    expect(periodOf("2026-08-19", NOW)).toBe("week");
    expect(periodOf("2026-08-17", NOW)).toBe("week");
  });

  it("puts the previous Mon–Sun in 'last week'", () => {
    expect(periodOf("2026-08-16", NOW)).toBe("lastweek");
    expect(periodOf("2026-08-10", NOW)).toBe("lastweek");
  });

  it("puts anything else this month in 'earlier this month'", () => {
    expect(periodOf("2026-08-09", NOW)).toBe("month");
    expect(periodOf("2026-08-01", NOW)).toBe("month");
  });

  it("puts last month and older in 'older'", () => {
    expect(periodOf("2026-07-31", NOW)).toBe("older");
    expect(periodOf("2025-12-25", NOW)).toBe("older");
  });

  it("uses CALENDAR boundaries, not elapsed durations", () => {
    const sunday = new Date(2026, 7, 23, 23, 0);
    const monday = new Date(2026, 7, 24, 0, 30);

    expect(periodOf("2026-08-17", NOW)).toBe("week");
    expect(periodOf("2026-08-17", sunday)).toBe("week");
    expect(periodOf("2026-08-17", monday)).toBe("lastweek");
  });

  it("prefers the NARROWER bucket where two could claim a day", () => {
    // Tuesday the 18th: Monday the 17th is both "yesterday" and start-of-week — yesterday should win
    const tuesday = new Date(2026, 7, 18, 9, 0);

    expect(periodOf("2026-08-17", tuesday)).toBe("yesterday");
  });

  it("treats Sunday as the end of its week, not the start", () => {
    const sunday = new Date(2026, 7, 23, 9, 0);

    expect(periodOf("2026-08-17", sunday)).toBe("week");
    expect(periodOf("2026-08-16", sunday)).toBe("lastweek");
  });

  it("lets a week span a month boundary", () => {
    // week of Wed 2 Sep began Mon 31 Aug — the 31st is "this week" despite being in the previous month
    const september = new Date(2026, 8, 2, 9, 0);

    expect(periodOf("2026-08-31", september)).toBe("week");
    expect(periodOf("2026-08-30", september)).toBe("lastweek");
    expect(periodOf("2026-08-25", september)).toBe("lastweek");
    expect(periodOf("2026-08-20", september)).toBe("older");
  });
});

describe("grouping the feed", () => {
  it("cuts rows into their periods, in order", () => {
    const groups = groupFeed(
      [
        item("2026-08-21T09:00:00Z"),
        item("2026-08-20T09:00:00Z"),
        item("2026-08-18T09:00:00Z"),
        item("2026-08-12T09:00:00Z"),
        item("2026-08-03T09:00:00Z"),
        item("2026-05-03T09:00:00Z"),
      ],
      NOW,
    );

    expect(groups.map((group) => group.period)).toEqual([
      "today",
      "yesterday",
      "week",
      "lastweek",
      "month",
      "older",
    ]);
  });

  it("OMITS EMPTY PERIODS", () => {
    const groups = groupFeed(
      [item("2026-08-21T09:00:00Z"), item("2026-08-21T08:00:00Z")],
      NOW,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items).toHaveLength(2);
  });

  it("keeps the order it was given inside a period", () => {
    const groups = groupFeed(
      [item("2026-08-21T09:00:00Z"), item("2026-08-21T07:00:00Z")],
      NOW,
    );

    expect(groups[0].items.map((row) => row.at)).toEqual([
      "2026-08-21T09:00:00Z",
      "2026-08-21T07:00:00Z",
    ]);
  });

  it("files an unparseable timestamp under 'older' rather than guessing today", () => {
    const groups = groupFeed([item("not a date")], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].period).toBe("older");
  });

  it("groups nothing into nothing — the empty state's input", () => {
    expect(groupFeed([], NOW)).toEqual([]);
  });
});

describe("current-user filtering", () => {
  it("marks a row as mine only when I am the assignee", () => {
    const rows = toFeedItems(
      [
        todo({ assignee_id: "u-me" }),
        todo({ assignee_id: "u-someone" }),
        todo({ assignee_id: null }),
      ],
      [board()],
    );

    expect(rows.map((row) => row.todo.assignee_id === "u-me")).toEqual([
      true,
      false,
      false,
    ]);
  });
});
