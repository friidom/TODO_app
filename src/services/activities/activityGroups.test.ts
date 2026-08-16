import { describe, expect, it } from "vitest";

import { groupActivitiesByDay } from "./activityGroups";
import type { Activity } from "@/types/data";

/**
 * Local times throughout, built with `new Date(y, m, d, h)` rather than an ISO
 * string with a zone: the module groups by the VIEWER's day, so a fixture
 * written in UTC would pass or fail depending on where the test ran.
 */
function at(date: Date): Activity {
  return {
    id: `act-${date.getTime()}`,
    board_id: "board-1",
    actor_id: "user-a",
    entity_type: "todo",
    entity_id: "todo-1",
    action: "created",
    payload: {},
    created_at: date.toISOString(),
  };
}

const NOW = new Date(2026, 7, 16, 14, 30); // 16 August 2026, local

describe("groupActivitiesByDay", () => {
  it("names the two most-read groups rather than dating them", () => {
    const days = groupActivitiesByDay(
      [at(new Date(2026, 7, 16, 9)), at(new Date(2026, 7, 15, 22))],
      NOW,
      "en-GB",
    );

    expect(days.map((day) => day.label)).toEqual(["Today", "Yesterday"]);
  });

  it("writes out anything older, with the weekday", () => {
    const days = groupActivitiesByDay(
      [at(new Date(2026, 7, 12, 9))],
      NOW,
      "en-GB",
    );

    expect(days[0].label).toContain("Wednesday");
    expect(days[0].label).toContain("12");
    expect(days[0].label).toContain("August");
  });

  it("adds the year only when it is not the current one", () => {
    const [thisYear] = groupActivitiesByDay(
      [at(new Date(2026, 0, 5, 9))],
      NOW,
      "en-GB",
    );
    const [lastYear] = groupActivitiesByDay(
      [at(new Date(2025, 0, 5, 9))],
      NOW,
      "en-GB",
    );

    expect(thisYear.label).not.toContain("2026");
    expect(lastYear.label).toContain("2025");
  });

  it("keeps every entry of a day together, in arrival order", () => {
    const first = at(new Date(2026, 7, 16, 11));
    const second = at(new Date(2026, 7, 16, 10));
    const older = at(new Date(2026, 7, 14, 10));

    const days = groupActivitiesByDay([first, second, older], NOW);

    expect(days).toHaveLength(2);
    expect(days[0].items).toEqual([first, second]);
    expect(days[1].items).toEqual([older]);
  });

  it("does not reorder days that the query already returned newest first", () => {
    const days = groupActivitiesByDay(
      [
        at(new Date(2026, 7, 16, 9)),
        at(new Date(2026, 7, 14, 9)),
        at(new Date(2026, 7, 10, 9)),
      ],
      NOW,
    );

    expect(days.map((day) => day.key)).toEqual([
      "2026-08-16",
      "2026-08-14",
      "2026-08-10",
    ]);
  });

  it("splits midnight across two days", () => {
    // The boundary case the whole module exists to get right: 23:59 and 00:01
    // are two minutes apart and belong to different headers.
    const days = groupActivitiesByDay(
      [at(new Date(2026, 7, 16, 0, 1)), at(new Date(2026, 7, 15, 23, 59))],
      NOW,
    );

    expect(days.map((day) => day.label)).toEqual(["Today", "Yesterday"]);
  });

  it("reads yesterday correctly across a month boundary", () => {
    const days = groupActivitiesByDay(
      [at(new Date(2026, 7, 31, 10))],
      new Date(2026, 8, 1, 9),
      "en-GB",
    );

    expect(days[0].label).toBe("Yesterday");
  });

  it("does not guess a day for an unparseable timestamp", () => {
    // Not "Today". A header is a claim about when something happened, and this
    // is the one row where that is unknown.
    const broken: Activity = { ...at(NOW), created_at: "not a time" };

    const days = groupActivitiesByDay([broken], NOW);

    expect(days[0].label).toBe("Undated");
    expect(days[0].items).toEqual([broken]);
  });

  it("returns nothing for an empty feed", () => {
    expect(groupActivitiesByDay([], NOW)).toEqual([]);
  });
});
