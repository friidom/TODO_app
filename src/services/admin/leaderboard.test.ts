import { describe, expect, it } from "vitest";

import {
  BOARD_SORT_KEYS,
  DEFAULT_BOARD_SORT,
  compareBy,
  isBoardSortKey,
  isLeaderboardMode,
  LEADERBOARD_MODES,
  metricShare,
  metricsFor,
  sortBoards,
} from "./leaderboard";
import { isUserSortKey, sortUsers } from "./sortUsers";
import type { AdminBoard, AdminUser } from "./types";

function board(title: string, fields: Partial<AdminBoard> = {}): AdminBoard {
  return {
    id: title,
    title,
    key_prefix: "KAN",
    owner_id: null,
    space_id: null,
    space_title: null,
    owner_username: null,
    members: 0,
    todos: 0,
    open_todos: 0,
    completed_todos: 0,
    completed_points: 0,
    unestimated_completed: 0,
    comments: 0,
    activities: 0,
    last_activity_at: null,
    median_cycle_days: null,
    ...fields,
  };
}

function person(username: string, fields: Partial<AdminUser> = {}): AdminUser {
  return {
    id: username,
    username,
    full_name: null,
    avatar_url: null,
    email: `${username}@test.invalid`,
    org_role: "member",
    seniority: null,
    completed_todos: 0,
    completed_points: 0,
    unestimated_completed: 0,
    comments: 0,
    activities: 0,
    boards: 0,
    median_cycle_days: null,
    cycle_n: 0,
    daily_points: null,
    weekly_points: null,
    target_points: null,
    performance: null,
    ...fields,
  };
}

describe("compareBy", () => {
  const rows = [{ v: 3 }, { v: 1 }, { v: null }, { v: 2 }];
  const read = (row: { v: number | null }) => row.v;
  const tie = () => 0;

  it("orders descending by default and ascending when asked", () => {
    expect(compareBy(rows, read, "desc", tie).map((r) => r.v)).toEqual([
      3,
      2,
      1,
      null,
    ]);
    expect(compareBy(rows, read, "asc", tie).map((r) => r.v)).toEqual([
      1,
      2,
      3,
      null,
    ]);
  });

  it("puts nulls last whichever way the column runs", () => {
    expect(compareBy(rows, read, "asc", tie).at(-1)!.v).toBeNull();
    expect(compareBy(rows, read, "desc", tie).at(-1)!.v).toBeNull();
  });

  it("breaks a tie with the tiebreak rather than wobbling between renders", () => {
    const tied = [
      { v: 1, name: "zoe" },
      { v: 1, name: "ana" },
    ];

    expect(
      compareBy(
        tied,
        (r) => r.v,
        "desc",
        (a, b) => a.name.localeCompare(b.name),
      ).map((r) => r.name),
    ).toEqual(["ana", "zoe"]);
  });

  it("does not mutate the array it was given", () => {
    const original = [{ v: 1 }, { v: 9 }];

    compareBy(original, read, "desc", tie);

    expect(original.map((r) => r.v)).toEqual([1, 9]);
  });
});

describe("sortUsers with a duration column", () => {
  it("sorts cycle time ascending — the fastest developer first", () => {
    const sorted = sortUsers(
      [
        person("slow", { median_cycle_days: 12 }),
        person("quick", { median_cycle_days: 2 }),
        person("mid", { median_cycle_days: 5 }),
      ],
      "median_cycle_days",
    );

    expect(sorted.map((row) => row.username)).toEqual(["quick", "mid", "slow"]);
  });

  it("never lets an untimed developer take first place in that column", () => {
    const sorted = sortUsers(
      [person("untimed"), person("quick", { median_cycle_days: 2 })],
      "median_cycle_days",
    );

    expect(sorted.map((row) => row.username)).toEqual(["quick", "untimed"]);
  });

  it("still sorts every other column descending", () => {
    const sorted = sortUsers(
      [
        person("few", { completed_todos: 1 }),
        person("many", { completed_todos: 9 }),
      ],
      "completed_todos",
    );

    expect(sorted.map((row) => row.username)).toEqual(["many", "few"]);
  });
});

describe("sortBoards", () => {
  it("shares the direction rule with the people table", () => {
    const rows = [
      board("slow", { median_cycle_days: 9 }),
      board("quick", { median_cycle_days: 1 }),
      board("untimed"),
    ];

    expect(sortBoards(rows, "median_cycle_days").map((b) => b.title)).toEqual([
      "quick",
      "slow",
      "untimed",
    ]);
    expect(
      sortBoards(rows, "completed_todos").map((b) => b.title),
    ).toHaveLength(3);
  });

  it("sorts by name ascending, because a name is not a quantity", () => {
    expect(
      sortBoards([board("zeta"), board("alpha")], "title").map((b) => b.title),
    ).toEqual(["alpha", "zeta"]);
  });

  it("tolerates an untitled board rather than throwing on it", () => {
    const rows = [board("alpha"), board("untitled", { title: null })];

    expect(sortBoards(rows, "title")).toHaveLength(2);
  });

  it("only offers keys it can actually sort", () => {
    expect(BOARD_SORT_KEYS.every(isBoardSortKey)).toBe(true);
    expect(isBoardSortKey("owner_username")).toBe(false);
    expect(isBoardSortKey(DEFAULT_BOARD_SORT)).toBe(true);
  });
});

describe("the mode registry", () => {
  it("offers People and Boards, and nothing that has no endpoint", () => {
    expect(LEADERBOARD_MODES).toEqual(["people", "boards"]);
    expect(isLeaderboardMode("teams")).toBe(false);
    expect(isLeaderboardMode("people")).toBe(true);
  });

  it("offers a target comparison for people only", () => {
    expect(metricsFor("people").map((m) => m.key)).toContain("performance");
    expect(metricsFor("boards").map((m) => m.key)).not.toContain("performance");
  });

  it("names every metric so a heading can never imply a general claim", () => {
    for (const mode of LEADERBOARD_MODES) {
      for (const metric of metricsFor(mode)) {
        expect(metric.label.length).toBeGreaterThan(0);
        expect(metric.hint.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("metricShare", () => {
  it("fills the track in proportion for a more-is-more column", () => {
    expect(metricShare(5, 10, "desc")).toBe(50);
    expect(metricShare(10, 10, "desc")).toBe(100);
  });

  it("inverts the bar for a duration, so the fastest row is the longest", () => {
    expect(metricShare(1, 10, "asc")).toBe(90);
    expect(metricShare(10, 10, "asc")).toBe(0);
  });

  it("draws nothing for an unmeasured value", () => {
    expect(metricShare(null, 10, "asc")).toBe(0);
    expect(metricShare(null, 10, "desc")).toBe(0);
    expect(metricShare(5, 0, "desc")).toBe(0);
  });
});

describe("the people metric switch", () => {
  it("offers comments and boards beside the delivery metrics", () => {
    const keys = metricsFor("people").map((metric) => metric.key);

    expect(keys).toContain("comments");
    expect(keys).toContain("boards");
    expect(keys).toContain("median_cycle_days");
  });

  it("every offered metric is one the table can actually sort by", () => {
    for (const metric of metricsFor("people")) {
      expect(isUserSortKey(metric.key)).toBe(true);
    }

    for (const metric of metricsFor("boards")) {
      expect(isBoardSortKey(metric.key)).toBe(true);
    }
  });
});
