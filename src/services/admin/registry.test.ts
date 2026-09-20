import { describe, expect, it } from "vitest";

import { activityQuery } from "./adminApi";
import {
  ADMIN_PERIODS,
  DEFAULT_PERIOD,
  isAdminPeriod,
  PERIOD_LABELS,
} from "./periods";
import {
  ADMIN_SECTIONS,
  adminSections,
  SERIES_METRICS,
  seriesMetrics,
} from "./registry";
import {
  DEFAULT_USER_SORT,
  isUserSortKey,
  sortUsers,
  USER_SORT_KEYS,
} from "./sortUsers";
import type { AdminUser } from "./types";

describe("the admin section registry", () => {
  it("lists exactly the five sections the nav renders", () => {
    expect(ADMIN_SECTIONS).toEqual([
      "dashboard",
      "users",
      "boards",
      "activity",
      "kpi",
    ]);
  });

  it("gives every section a label and a path, and no two share a path", () => {
    const paths = adminSections().map((section) => section.path);

    expect(paths).toHaveLength(ADMIN_SECTIONS.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(adminSections().every((section) => section.label.length > 0)).toBe(
      true,
    );
    expect(paths.every((path) => path.startsWith("/admin"))).toBe(true);
  });
});

describe("the series metric registry", () => {
  it("holds the four factual series E2 chose, and no composite", () => {
    expect(SERIES_METRICS).toEqual([
      "completed_todos",
      "completed_points",
      "comments",
      "activities",
    ]);
  });

  it("marks points as the one series carrying an unestimated count", () => {
    const carrying = seriesMetrics().filter(
      (metric) => metric.countsUnestimated,
    );

    expect(carrying.map((metric) => metric.metric)).toEqual([
      "completed_points",
    ]);
  });
});

describe("the period list", () => {
  it("is the six M34 declares, in order, defaulting to 7 days", () => {
    expect(ADMIN_PERIODS).toEqual(["1d", "7d", "30d", "3m", "quarter", "year"]);
    expect(DEFAULT_PERIOD).toBe("7d");
  });

  // 3m and quarter are different windows and the labels have to say so, or
  // the selector shows the same thing twice.
  it("labels every period distinctly", () => {
    const labels = ADMIN_PERIODS.map((period) => PERIOD_LABELS[period]);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it("rejects a period the server would refuse", () => {
    expect(isAdminPeriod("90d")).toBe(false);
    expect(isAdminPeriod("7d")).toBe(true);
  });
});

describe("activityQuery", () => {
  it("carries only the filters that are set", () => {
    expect(activityQuery({ period: "7d" })).toBe("?period=7d");
    expect(activityQuery({ period: "7d", board: "b1" })).toBe(
      "?period=7d&board=b1",
    );
  });

  it("is stable for equal filters, so two renders are one cache entry", () => {
    expect(activityQuery({ period: "30d", user: "u1" })).toBe(
      activityQuery({ period: "30d", user: "u1" }),
    );
  });

  it("appends both halves of a cursor or neither", () => {
    const query = activityQuery(
      { period: "7d" },
      { before: "2026-09-20", before_id: "a1" },
    );

    expect(query).toContain("before=2026-09-20");
    expect(query).toContain("before_id=a1");
  });
});

function user(username: string, fields: Partial<AdminUser> = {}): AdminUser {
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
    daily_points: null,
    weekly_points: null,
    target_points: null,
    performance: null,
    ...fields,
  };
}

describe("sortUsers", () => {
  it("sorts one factual column descending, defaulting to completed tasks", () => {
    expect(DEFAULT_USER_SORT).toBe("completed_todos");

    const sorted = sortUsers(
      [user("ana", { completed_todos: 1 }), user("bo", { completed_todos: 9 })],
      "completed_todos",
    );

    expect(sorted.map((row) => row.username)).toEqual(["bo", "ana"]);
  });

  it("sorts by name ascending, because a name is not a quantity", () => {
    const sorted = sortUsers([user("zoe"), user("ana")], "username");

    expect(sorted.map((row) => row.username)).toEqual(["ana", "zoe"]);
  });

  it("breaks a tie by name, so the order does not wobble between renders", () => {
    const sorted = sortUsers(
      [user("zoe", { comments: 3 }), user("ana", { comments: 3 })],
      "comments",
    );

    expect(sorted.map((row) => row.username)).toEqual(["ana", "zoe"]);
  });

  // Unmeasured is not unproductive: a user with no target must not rank below
  // someone who genuinely achieved 0%.
  it("puts users with no performance last, below a real zero", () => {
    const sorted = sortUsers(
      [
        user("nil"),
        user("zero", { performance: 0 }),
        user("high", { performance: 80 }),
      ],
      "performance",
    );

    expect(sorted.map((row) => row.username)).toEqual(["high", "zero", "nil"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [user("ana", { comments: 1 }), user("bo", { comments: 5 })];

    sortUsers(rows, "comments");

    expect(rows.map((row) => row.username)).toEqual(["ana", "bo"]);
  });

  it("only offers keys it can actually sort", () => {
    expect(USER_SORT_KEYS.every(isUserSortKey)).toBe(true);
    expect(isUserSortKey("email")).toBe(false);
  });
});
