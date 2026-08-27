import { describe, expect, it } from "vitest";

import type { Todo } from "@/types/data";
import { timelineTicks } from "./timeline";
import {
  buildTimelineHierarchy,
  countHierarchyItems,
  countPlacedHierarchyItems,
  placeTimelineHierarchy,
  undatedTimelineTodos,
} from "./timelineHierarchy";

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
    parent_id: null,
    start_date: null,
    due_date: null,
    assignee_id: null,
    created_at: `2026-08-01T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    updated_at: null,
    ...over,
  } as Todo;
}

const epic = (over: Partial<Todo> = {}) => todo({ ...over, type: "Epic" });

/** A stored instant, written the way `fromCalendarDay` writes one. */
function at(day: string): string {
  return `${day}T00:00:00.000Z`;
}

describe("buildTimelineHierarchy — grouping", () => {
  it("gives every Epic its own group, even with no Tasks", () => {
    const e = epic({ id: "e-1" });

    const hierarchy = buildTimelineHierarchy([e]);

    expect(hierarchy.epics).toHaveLength(1);
    expect(hierarchy.epics[0].epic.id).toBe("e-1");
    expect(hierarchy.epics[0].taskCount).toBe(0);
    expect(hierarchy.epics[0].item).toBeNull();
  });

  it("nests a Task under its Epic rather than listing it top-level", () => {
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-12"),
    });

    const hierarchy = buildTimelineHierarchy([e, task]);

    expect(hierarchy.epics[0].tasks.map((item) => item.todo.id)).toEqual([
      "t-1",
    ]);
    expect(hierarchy.topLevel).toHaveLength(0);
  });

  it("keeps an unparented Task top-level", () => {
    const solo = todo({
      id: "t-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-12"),
    });

    const hierarchy = buildTimelineHierarchy([solo]);

    expect(hierarchy.topLevel.map((item) => item.todo.id)).toEqual(["t-1"]);
    expect(hierarchy.epics).toHaveLength(0);
  });

  it("does not let a genuine Subtask surface as a top-level row", () => {
    // Defence in depth: `useVisibleTodos` already drops these before this
    // module sees the array, but the invariant is stated here too.
    const parent = todo({ id: "t-1" });
    const subtask = todo({
      id: "s-1",
      parent_id: "t-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-10"),
    });

    const hierarchy = buildTimelineHierarchy([parent, subtask]);

    expect(hierarchy.topLevel.some((item) => item.todo.id === "s-1")).toBe(
      false,
    );
  });

  it("treats a Task orphaned by a filtered-out Epic as top-level, not missing", () => {
    // The Epic itself is not in `todos` — filtered by search/type, or a
    // transient cache gap. The Task must still render somewhere.
    const orphan = todo({
      id: "t-1",
      parent_id: "epic-not-in-array",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-10"),
    });

    const hierarchy = buildTimelineHierarchy([orphan]);

    expect(hierarchy.topLevel.map((item) => item.todo.id)).toEqual(["t-1"]);
  });

  it("counts every child toward taskCount, dated or not", () => {
    const e = epic({ id: "e-1" });
    const dated = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-10"),
    });
    const undated = todo({ id: "t-2", parent_id: "e-1" });

    const hierarchy = buildTimelineHierarchy([e, dated, undated]);

    expect(hierarchy.epics[0].taskCount).toBe(2);
    expect(hierarchy.epics[0].tasks).toHaveLength(1);
  });
});

describe("buildTimelineHierarchy — Epic dates", () => {
  it("uses the Epic's own explicit dates over any rollup", () => {
    const e = epic({
      id: "e-1",
      start_date: at("2026-08-01"),
      due_date: at("2026-08-31"),
    });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-12"),
    });

    const hierarchy = buildTimelineHierarchy([e, task]);
    const group = hierarchy.epics[0];

    expect(group.item).toMatchObject({
      start: "2026-08-01",
      end: "2026-08-31",
    });
    expect(group.isDerived).toBe(false);
  });

  it("rolls up from the earliest start to the latest due date of its Tasks", () => {
    const e = epic({ id: "e-1" });
    const early = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-05"),
      due_date: at("2026-08-10"),
    });
    const late = todo({
      id: "t-2",
      parent_id: "e-1",
      start_date: at("2026-08-08"),
      due_date: at("2026-08-20"),
    });

    const hierarchy = buildTimelineHierarchy([e, early, late]);
    const group = hierarchy.epics[0];

    expect(group.item).toMatchObject({
      start: "2026-08-05",
      end: "2026-08-20",
    });
    expect(group.isDerived).toBe(true);
  });

  it("has no item at all when neither the Epic nor any Task has a date", () => {
    const e = epic({ id: "e-1" });
    const undated = todo({ id: "t-1", parent_id: "e-1" });

    const hierarchy = buildTimelineHierarchy([e, undated]);

    expect(hierarchy.epics[0].item).toBeNull();
    expect(hierarchy.epics[0].isDerived).toBe(false);
  });

  it("rolls up from a single dated Task, even a point", () => {
    const e = epic({ id: "e-1" });
    const point = todo({
      id: "t-1",
      parent_id: "e-1",
      due_date: at("2026-08-14"),
    });

    const hierarchy = buildTimelineHierarchy([e, point]);

    expect(hierarchy.epics[0].item).toMatchObject({
      start: "2026-08-14",
      end: "2026-08-14",
      isPoint: false, // the group's own rolled-up span, not the child's shape
    });
  });
});

describe("placeTimelineHierarchy", () => {
  const ticks = timelineTicks("weeks", "2026-08-17"); // 2026-08-17 .. 09-27

  it("keeps a bare Epic (no dates anywhere) regardless of the window", () => {
    const e = epic({ id: "e-1" });

    const hierarchy = buildTimelineHierarchy([e]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(placed.epics).toHaveLength(1);
    expect(placed.epics[0].place).toBeNull();
  });

  it("drops an Epic whose own range and every Task are off-window", () => {
    const e = epic({
      id: "e-1",
      start_date: at("2026-01-01"),
      due_date: at("2026-01-05"),
    });

    const hierarchy = buildTimelineHierarchy([e]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(placed.epics).toHaveLength(0);
  });

  it("keeps the group when a Task is in-window even if the Epic's own range is not", () => {
    const e = epic({
      id: "e-1",
      start_date: at("2026-01-01"),
      due_date: at("2026-01-05"),
    });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-18"),
      due_date: at("2026-08-19"),
    });

    const hierarchy = buildTimelineHierarchy([e, task]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(placed.epics).toHaveLength(1);
    expect(placed.epics[0].place).toBeNull(); // the Epic's own bar is still off-window
    expect(placed.epics[0].tasks).toHaveLength(1);
  });

  it("places top-level Tasks exactly as timeline.ts already does", () => {
    const inWindow = todo({
      id: "t-1",
      start_date: at("2026-08-18"),
      due_date: at("2026-08-19"),
    });
    const outOfWindow = todo({
      id: "t-2",
      start_date: at("2026-01-01"),
      due_date: at("2026-01-05"),
    });

    const hierarchy = buildTimelineHierarchy([inWindow, outOfWindow]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(placed.topLevel.map((row) => row.item.todo.id)).toEqual(["t-1"]);
  });
});

describe("countHierarchyItems / countPlacedHierarchyItems", () => {
  const ticks = timelineTicks("weeks", "2026-08-17");

  it("agrees when everything is inside the window", () => {
    const e = epic({
      id: "e-1",
      start_date: at("2026-08-17"),
      due_date: at("2026-08-20"),
    });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-18"),
      due_date: at("2026-08-19"),
    });

    const hierarchy = buildTimelineHierarchy([e, task]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(countHierarchyItems(hierarchy)).toBe(2);
    expect(countPlacedHierarchyItems(placed)).toBe(2);
  });

  it("differs by exactly what the window drops", () => {
    const outside = todo({
      id: "t-1",
      start_date: at("2026-01-01"),
      due_date: at("2026-01-05"),
    });
    const inside = todo({
      id: "t-2",
      start_date: at("2026-08-18"),
      due_date: at("2026-08-19"),
    });

    const hierarchy = buildTimelineHierarchy([outside, inside]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(countHierarchyItems(hierarchy)).toBe(2);
    expect(countPlacedHierarchyItems(placed)).toBe(1);
  });
});

describe("undatedTimelineTodos", () => {
  it("excludes Epics — they already have a header row regardless of dates", () => {
    const e = epic({ id: "e-1" });
    const bareTask = todo({ id: "t-1" });

    expect(undatedTimelineTodos([e, bareTask]).map((t) => t.id)).toEqual([
      "t-1",
    ]);
  });

  it("still lists a dateless Task that belongs to an Epic", () => {
    const e = epic({ id: "e-1" });
    const child = todo({ id: "t-1", parent_id: "e-1" });

    expect(undatedTimelineTodos([e, child]).map((t) => t.id)).toEqual(["t-1"]);
  });

  it("agrees with `unscheduledTodos` on everything but Epics", () => {
    const dated = todo({ id: "t-1", due_date: at("2026-08-10") });
    const bareTask = todo({ id: "t-2" });
    const e = epic({ id: "e-1" });

    expect(undatedTimelineTodos([dated, bareTask, e])).toHaveLength(1);
  });
});
