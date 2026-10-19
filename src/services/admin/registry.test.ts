import { describe, expect, it } from "vitest";

import { activityQuery } from "./adminApi";
import {
  ADMIN_PERIODS,
  DEFAULT_PERIOD,
  isAdminPeriod,
  PERIOD_LABELS,
} from "./periods";
import {
  ADMIN_GROUPS,
  ADMIN_SECTIONS,
  adminSections,
  sectionForPath,
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
  it("lists exactly the sections the nav renders, in nav order", () => {
    expect(ADMIN_SECTIONS).toEqual([
      "dashboard",
      "users",
      "spaces",
      "boards",
      "flow",
      "leaderboards",
      "activity",
      "kpi",
      "access",
      "audit",
    ]);
  });

  it("groups the analytics under Insights and access under Security", () => {
    const byGroup = (group: string | null) =>
      adminSections()
        .filter((section) => section.group === group)
        .map((section) => section.section);

    expect(byGroup(null)).toEqual(["dashboard", "users", "spaces", "boards"]);
    expect(byGroup("insights")).toEqual([
      "flow",
      "leaderboards",
      "activity",
      "kpi",
    ]);
    expect(byGroup("security")).toEqual(["access", "audit"]);
    expect(ADMIN_GROUPS).toEqual([null, "insights", "security"]);
  });

  it("offers the period only where it changes what the page shows", () => {
    const unscoped = adminSections()
      .filter((section) => !section.periodScoped)
      .map((section) => section.section);

    expect(unscoped).toEqual(["kpi", "access", "audit"]);
  });

  it("finds the section a detail page belongs to", () => {
    expect(sectionForPath("/admin").section).toBe("dashboard");
    expect(sectionForPath("/admin/").section).toBe("dashboard");
    expect(sectionForPath("/admin/users/abc").section).toBe("users");
    expect(sectionForPath("/admin/boards/abc").section).toBe("boards");
    expect(sectionForPath("/admin/audit").section).toBe("audit");
    // A prefix of another word is not the section.
    expect(sectionForPath("/admin/usersettings").section).toBe("dashboard");
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

  it("carries the space and date-range facets a drill-down sets", () => {
    const query = activityQuery({
      period: "30d",
      space: "s1",
      from: "2026-09-18T00:00:00Z",
      to: "2026-09-19T00:00:00Z",
    });

    expect(query).toContain("space=s1");
    expect(query).toContain("from=");
    expect(query).toContain("to=");
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
    median_cycle_days: null,
    cycle_n: 0,
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
