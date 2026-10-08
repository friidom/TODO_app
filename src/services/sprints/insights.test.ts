import { describe, expect, it } from "vitest";

import {
  daysLeft,
  roundPoints,
  sprintBurndown,
  sprintInsights,
} from "./insights";
import type { IStatus, Todo } from "@/types/data";

const SPRINT = "sprint-1";
const TODAY = "2026-10-08";

const todo = (over: Partial<Todo> & { id: string }): Todo =>
  ({
    board_id: "board-1",
    status_id: "st-todo",
    parent_id: null,
    sprint_id: SPRINT,
    type: "Task",
    estimate: null,
    due_date: null,
    created_at: "2026-08-28T10:00:00.000Z",
    title: `todo ${over.id}`,
    ...over,
  }) as Todo;

const status = (id: string, category: IStatus["category"]): IStatus =>
  ({ id, category, board_id: "board-1", name: id }) as IStatus;

const STATUSES = [
  status("st-todo", "todo"),
  status("st-doing", "in_progress"),
  status("st-review", "in_review"),
  status("st-done", "done"),
];

describe("sprintInsights", () => {
  it("is all zeros for a sprint with nothing in it", () => {
    const result = sprintInsights([], SPRINT, STATUSES, TODAY);

    expect(result).toMatchObject({
      total: 0,
      done: 0,
      inProgress: 0,
      notStarted: 0,
      donePercent: 0,
      inProgressPercent: 0,
      notStartedPercent: 0,
      overdue: [],
      epics: [],
    });
  });

  it("only counts work planned into this sprint", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b", sprint_id: "other" }),
      todo({ id: "c", sprint_id: null }),
    ];

    expect(sprintInsights(todos, SPRINT, STATUSES, TODAY).total).toBe(1);
  });

  it("buckets by category, counting review as in progress", () => {
    const todos = [
      todo({ id: "a", status_id: "st-done" }),
      todo({ id: "b", status_id: "st-doing" }),
      todo({ id: "c", status_id: "st-review" }),
      todo({ id: "d", status_id: "st-todo" }),
    ];

    expect(sprintInsights(todos, SPRINT, STATUSES, TODAY)).toMatchObject({
      total: 4,
      done: 1,
      inProgress: 2,
      notStarted: 1,
    });
  });

  it("treats a card with no status as not started", () => {
    const result = sprintInsights(
      [todo({ id: "a", status_id: null })],
      SPRINT,
      STATUSES,
      TODAY,
    );

    expect(result.notStarted).toBe(1);
  });

  it("makes the three percentages add up to 100", () => {
    const todos = [
      todo({ id: "a", status_id: "st-done" }),
      todo({ id: "b", status_id: "st-doing" }),
      todo({ id: "c", status_id: "st-todo" }),
    ];

    const result = sprintInsights(todos, SPRINT, STATUSES, TODAY);

    expect(
      result.donePercent + result.inProgressPercent + result.notStartedPercent,
    ).toBe(100);
  });

  it("matches the Jira reference: everything in progress is 100%", () => {
    const result = sprintInsights(
      [todo({ id: "a", status_id: "st-doing" })],
      SPRINT,
      STATUSES,
      TODAY,
    );

    expect(result).toMatchObject({
      donePercent: 0,
      inProgressPercent: 100,
      notStartedPercent: 0,
    });
  });

  describe("overdue", () => {
    it("lists unfinished work past its due day, most overdue first", () => {
      const todos = [
        todo({ id: "recent", due_date: "2026-10-07T00:00:00+00:00" }),
        todo({ id: "old", due_date: "2026-09-01T00:00:00+00:00" }),
        todo({ id: "future", due_date: "2026-10-20T00:00:00+00:00" }),
        todo({ id: "none" }),
      ];

      expect(
        sprintInsights(todos, SPRINT, STATUSES, TODAY).overdue.map((r) => r.id),
      ).toEqual(["old", "recent"]);
    });

    it("does not list work due today", () => {
      const todos = [todo({ id: "a", due_date: "2026-10-08T00:00:00+00:00" })];

      expect(sprintInsights(todos, SPRINT, STATUSES, TODAY).overdue).toEqual(
        [],
      );
    });

    it("does not list finished work, however late", () => {
      const todos = [
        todo({
          id: "a",
          status_id: "st-done",
          due_date: "2026-09-01T00:00:00+00:00",
        }),
      ];

      expect(sprintInsights(todos, SPRINT, STATUSES, TODAY).overdue).toEqual(
        [],
      );
    });
  });

  describe("epics", () => {
    const anEpic = todo({
      id: "epic",
      type: "Epic",
      sprint_id: null,
    });

    it("names each Epic once, with the progress of all its tasks", () => {
      const todos = [
        anEpic,
        todo({ id: "t1", parent_id: "epic", status_id: "st-done" }),
        todo({ id: "t2", parent_id: "epic", status_id: "st-todo" }),
        todo({ id: "outside", parent_id: "epic", sprint_id: null }),
      ];

      const { epics } = sprintInsights(todos, SPRINT, STATUSES, TODAY);

      expect(epics).toHaveLength(1);
      expect(epics[0].epic.id).toBe("epic");
      expect(epics[0].progress).toEqual({ done: 1, total: 3, percent: 33 });
    });

    it("ignores work that sits under an ordinary task, not an Epic", () => {
      const todos = [
        todo({ id: "parent" }),
        todo({ id: "child", parent_id: "parent" }),
      ];

      expect(sprintInsights(todos, SPRINT, STATUSES, TODAY).epics).toEqual([]);
    });

    it("leaves out an Epic none of whose tasks are in the sprint", () => {
      const todos = [
        anEpic,
        todo({ id: "t", parent_id: "epic", sprint_id: "other" }),
      ];

      expect(sprintInsights(todos, SPRINT, STATUSES, TODAY).epics).toEqual([]);
    });
  });

  it("totals story points through sprintPoints", () => {
    const todos = [
      todo({ id: "a", estimate: 3, status_id: "st-done" }),
      todo({ id: "b", estimate: 5 }),
      todo({ id: "c", estimate: null }),
    ];

    expect(sprintInsights(todos, SPRINT, STATUSES, TODAY).points).toMatchObject(
      { total: 8, completed: 3, unestimated: 1 },
    );
  });
});

describe("daysLeft", () => {
  it("is null without an end date", () => {
    expect(daysLeft(null, TODAY)).toBeNull();
  });

  it("is 0 on the day itself, whatever the clock time in the stored value", () => {
    expect(daysLeft("2026-10-08T23:59:59+00:00", TODAY)).toBe(0);
  });

  it("counts whole days ahead and behind", () => {
    expect(daysLeft("2026-10-15", TODAY)).toBe(7);
    expect(daysLeft("2026-10-05", TODAY)).toBe(-3);
  });

  it("is null for something that is not a date", () => {
    expect(daysLeft("soon", TODAY)).toBeNull();
  });
});

describe("sprintBurndown", () => {
  const sprint = {
    id: SPRINT,
    start_date: "2026-10-01T00:00:00+00:00",
    end_date: "2026-10-10T00:00:00+00:00",
  };

  it("is null without a start date to draw from", () => {
    expect(
      sprintBurndown([], { ...sprint, start_date: null }, STATUSES, TODAY),
    ).toBeNull();
  });

  it("spans start to end, and marks the end and today", () => {
    const result = sprintBurndown([], sprint, STATUSES, TODAY);

    expect(result?.days[0]).toBe("2026-10-01");
    expect(result?.days.at(-1)).toBe("2026-10-10");
    expect(result?.days).toHaveLength(10);
    expect(result?.endIndex).toBe(9);
    expect(result?.todayIndex).toBe(7);
  });

  it("runs past the end date to today when the sprint is late", () => {
    const result = sprintBurndown([], sprint, STATUSES, "2026-10-14");

    expect(result?.days.at(-1)).toBe("2026-10-14");
    expect(result?.endIndex).toBe(9);
    expect(result?.todayIndex).toBe(13);
  });

  it("burns story points down on the day each card was completed", () => {
    const todos = [
      todo({
        id: "a",
        estimate: 3,
        status_id: "st-done",
        completed_at: "2026-10-03T15:00:00.000Z",
      }),
      todo({
        id: "b",
        estimate: 5,
        status_id: "st-done",
        completed_at: "2026-10-05T09:00:00.000Z",
      }),
      todo({ id: "c", estimate: 2, status_id: "st-doing" }),
      todo({ id: "d", estimate: null }),
      todo({ id: "elsewhere", estimate: 8, sprint_id: "other" }),
    ];

    const result = sprintBurndown(todos, sprint, STATUSES, TODAY);

    expect(result).toMatchObject({ unit: "points", total: 10, done: 8 });
    // Oct 1..8: nothing, nothing, -3, -3, -5 more, then flat through today
    expect(result?.remaining).toEqual([10, 10, 7, 7, 2, 2, 2, 2]);
  });

  it("counts work finished before the sprint started as done from day one", () => {
    const todos = [
      todo({
        id: "a",
        estimate: 4,
        status_id: "st-done",
        completed_at: "2026-09-20T10:00:00.000Z",
      }),
      todo({ id: "b", estimate: 4 }),
    ];

    expect(sprintBurndown(todos, sprint, STATUSES, TODAY)?.remaining[0]).toBe(
      4,
    );
  });

  it("counts work items when nothing is estimated", () => {
    const todos = [
      todo({
        id: "a",
        status_id: "st-done",
        completed_at: "2026-10-02T10:00:00.000Z",
      }),
      todo({ id: "b" }),
      todo({ id: "c" }),
    ];

    const result = sprintBurndown(todos, sprint, STATUSES, TODAY);

    expect(result).toMatchObject({ unit: "items", total: 3, done: 1 });
    expect(result?.remaining.slice(0, 3)).toEqual([3, 2, 2]);
  });

  it("does not count a card that left done, whatever it once said", () => {
    const todos = [
      todo({
        id: "a",
        estimate: 3,
        status_id: "st-doing",
        completed_at: "2026-10-02T10:00:00.000Z",
      }),
    ];

    expect(sprintBurndown(todos, sprint, STATUSES, TODAY)?.remaining).toEqual(
      Array(8).fill(3),
    );
  });

  it("has nothing to plot yet before the sprint starts", () => {
    const result = sprintBurndown([], sprint, STATUSES, "2026-09-25");

    expect(result?.remaining).toEqual([]);
    expect(result?.todayIndex).toBeNull();
    expect(result?.days).toHaveLength(10);
  });

  it("draws to today when the sprint has no end date", () => {
    const result = sprintBurndown(
      [],
      { ...sprint, end_date: null },
      STATUSES,
      TODAY,
    );

    expect(result?.endIndex).toBeNull();
    expect(result?.days.at(-1)).toBe(TODAY);
  });
});

describe("roundPoints", () => {
  it("drops the binary noise a sum of decimal estimates carries", () => {
    expect(roundPoints(0.1 + 0.2)).toBe(0.3);
    expect(roundPoints(10.5 - 3.2)).toBe(7.3);
    expect(roundPoints(8)).toBe(8);
  });
});
