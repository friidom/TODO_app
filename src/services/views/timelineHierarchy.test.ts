import { describe, expect, it } from "vitest";

import type { Sprint, Todo } from "@/types/data";
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
    sprint_id: null,
    backlog_rank: null,
    assignee_id: null,
    created_at: `2026-08-01T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    updated_at: null,
    ...over,
  } as Todo;
}

const epic = (over: Partial<Todo> = {}) => todo({ ...over, type: "Epic" });

function sprint(over: Partial<Sprint> & { id: string }): Sprint {
  return {
    board_id: "b-1",
    name: `Sprint ${over.id}`,
    goal: null,
    start_date: null,
    end_date: null,
    state: "future",
    rank: 1024,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: null,
    ...over,
  } as Sprint;
}

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

  it("shows multiple Epics, each with its own group", () => {
    const a = epic({ id: "e-1" });
    const b = epic({ id: "e-2" });
    const c = epic({ id: "e-3" });

    const hierarchy = buildTimelineHierarchy([a, b, c]);

    expect(hierarchy.epics.map((group) => group.epic.id)).toEqual([
      "e-1",
      "e-2",
      "e-3",
    ]);
  });

  it("nests a Task under its Epic", () => {
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-12"),
    });

    const hierarchy = buildTimelineHierarchy([e, task]);

    expect(hierarchy.epics[0].tasks.map((t) => t.item.todo.id)).toEqual([
      "t-1",
    ]);
  });

  it("does not give a Task with dates but no Epic any row at all", () => {
    // The correction this milestone makes: this view's top-level rows are
    // Epics only. A dated, unparented Task belongs to the Board and the
    // List, never to this screen — it is not "top-level" here, it is simply
    // out of scope, so there is nowhere in the returned hierarchy it could
    // appear.
    const solo = todo({
      id: "t-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-12"),
    });

    const hierarchy = buildTimelineHierarchy([solo]);

    expect(hierarchy.epics).toHaveLength(0);

    const everyTaskId = hierarchy.epics.flatMap((group) =>
      group.tasks.map((t) => t.item.todo.id),
    );

    expect(everyTaskId).not.toContain("t-1");
  });

  it("never appears — a genuine Subtask does not surface as its Task's row nor nested under any Epic", () => {
    // Defence in depth: `useVisibleTodos` already drops these before this
    // module sees the array (M27), but the invariant is stated here too.
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-12"),
    });
    const subtask = todo({
      id: "s-1",
      parent_id: "t-1",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-10"),
    });

    const hierarchy = buildTimelineHierarchy([e, task, subtask]);

    expect(hierarchy.epics[0].tasks.map((t) => t.item.todo.id)).toEqual([
      "t-1",
    ]);
    // Only the Task is a direct child of the Epic — the Subtask is a child
    // of the Task, two levels down, and must not inflate the Epic's own
    // count of Tasks it directly owns.
    expect(hierarchy.epics[0].taskCount).toBe(1);
  });

  it("drops a Task whose Epic is not present, rather than making it top-level", () => {
    // The Epic itself is not in `todos` — filtered by search/type, or a
    // transient cache gap. Membership is `childrenOf(todos, epic.id)` and
    // nothing wider, so a Task naming an absent Epic has no group to join —
    // the correction removed the old "fall back to top-level" rule along
    // with the plain top-level row it fell back into.
    const orphan = todo({
      id: "t-1",
      parent_id: "epic-not-in-array",
      start_date: at("2026-08-10"),
      due_date: at("2026-08-10"),
    });

    const hierarchy = buildTimelineHierarchy([orphan]);

    expect(hierarchy.epics).toHaveLength(0);
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

  it("never places a dated, unparented Task — there is no row for it to occupy", () => {
    const solo = todo({
      id: "t-1",
      start_date: at("2026-08-18"),
      due_date: at("2026-08-19"),
    });

    const hierarchy = buildTimelineHierarchy([solo]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(placed.epics).toHaveLength(0);
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
    // Two Epics, one dated this month and one dated back in January.
    const here = epic({
      id: "e-1",
      start_date: at("2026-08-18"),
      due_date: at("2026-08-19"),
    });
    const gone = epic({
      id: "e-2",
      start_date: at("2026-01-01"),
      due_date: at("2026-01-05"),
    });

    const hierarchy = buildTimelineHierarchy([here, gone]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(countHierarchyItems(hierarchy)).toBe(2);
    expect(countPlacedHierarchyItems(placed)).toBe(1);
  });

  it("never counts a dated, unparented Task in either total", () => {
    const solo = todo({
      id: "t-1",
      start_date: at("2026-08-18"),
      due_date: at("2026-08-19"),
    });

    const hierarchy = buildTimelineHierarchy([solo]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(countHierarchyItems(hierarchy)).toBe(0);
    expect(countPlacedHierarchyItems(placed)).toBe(0);
  });
});

describe("undatedTimelineTodos", () => {
  it("excludes Epics — they already have a header row regardless of dates", () => {
    const e = epic({ id: "e-1" });
    const child = todo({ id: "t-1", parent_id: "e-1" });

    expect(undatedTimelineTodos([e, child]).map((t) => t.id)).toEqual(["t-1"]);
  });

  it("still lists a dateless Task that belongs to an Epic", () => {
    const e = epic({ id: "e-1" });
    const child = todo({ id: "t-1", parent_id: "e-1" });

    expect(undatedTimelineTodos([e, child]).map((t) => t.id)).toEqual(["t-1"]);
  });

  it("excludes a dateless, unparented Task — it is out of scope for this whole view", () => {
    const orphan = todo({ id: "t-1" });

    expect(undatedTimelineTodos([orphan])).toHaveLength(0);
  });

  it("is narrower than `unscheduledTodos`, by exactly the unparented Tasks", () => {
    const e = epic({ id: "e-1" });
    const owned = todo({ id: "t-1", parent_id: "e-1" });
    const orphan = todo({ id: "t-2" });

    expect(undatedTimelineTodos([e, owned, orphan]).map((t) => t.id)).toEqual([
      "t-1",
    ]);
  });
});

describe("buildTimelineHierarchy — Sprint rows", () => {
  it("shows a Sprint with both dates as its own row", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });

    const hierarchy = buildTimelineHierarchy([], [s]);

    expect(hierarchy.sprints).toHaveLength(1);
    expect(hierarchy.sprints[0]).toMatchObject({
      start: "2026-08-01",
      end: "2026-09-01",
    });
    expect(hierarchy.sprints[0].sprint.id).toBe("s-1");
  });

  it("shows multiple Sprints, each with its own range", () => {
    const s1 = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-08-14"),
    });
    const s2 = sprint({
      id: "s-2",
      start_date: at("2026-08-15"),
      end_date: at("2026-08-28"),
    });

    const hierarchy = buildTimelineHierarchy([], [s1, s2]);

    expect(hierarchy.sprints.map((s) => s.sprint.id)).toEqual(["s-1", "s-2"]);
    expect(hierarchy.sprints[0]).toMatchObject({
      start: "2026-08-01",
      end: "2026-08-14",
    });
    expect(hierarchy.sprints[1]).toMatchObject({
      start: "2026-08-15",
      end: "2026-08-28",
    });
  });

  it("is not shown at all with no dates -- not a bare row like an Epic gets", () => {
    const s = sprint({ id: "s-1" });

    expect(buildTimelineHierarchy([], [s]).sprints).toHaveLength(0);
  });

  it("is not shown with only a start date", () => {
    const s = sprint({ id: "s-1", start_date: at("2026-08-01") });

    expect(buildTimelineHierarchy([], [s]).sprints).toHaveLength(0);
  });

  it("is not shown with only an end date", () => {
    const s = sprint({ id: "s-1", end_date: at("2026-09-01") });

    expect(buildTimelineHierarchy([], [s]).sprints).toHaveLength(0);
  });

  it("defaults to no Sprint rows when the argument is omitted", () => {
    // Every pre-Sprint call site (and every test above this one) calls
    // buildTimelineHierarchy with one argument -- this is what keeps them
    // passing unchanged.
    const e = epic({ id: "e-1" });

    expect(buildTimelineHierarchy([e]).sprints).toEqual([]);
  });
});

describe("buildTimelineHierarchy — Sprint-bound Tasks", () => {
  it("clamps a Sprint-bound Task's range to its Sprint's, ignoring its own dates", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      sprint_id: "s-1",
      // Its own dates, deliberately far from the Sprint's -- must never win.
      start_date: at("2026-01-01"),
      due_date: at("2026-01-02"),
    });

    const hierarchy = buildTimelineHierarchy([e, task], [s]);
    const bound = hierarchy.epics[0].tasks[0];

    expect(bound.item).toMatchObject({ start: "2026-08-01", end: "2026-09-01" });
    expect(bound.sprintBound).toBe(true);
  });

  it("clamps a Sprint-bound Task with no dates of its own the same way", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });
    const e = epic({ id: "e-1" });
    const task = todo({ id: "t-1", parent_id: "e-1", sprint_id: "s-1" });

    const hierarchy = buildTimelineHierarchy([e, task], [s]);

    expect(hierarchy.epics[0].tasks[0].item).toMatchObject({
      start: "2026-08-01",
      end: "2026-09-01",
    });
  });

  it("matches the Sprint's start exactly", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      sprint_id: "s-1",
      start_date: at("2026-08-15"),
      due_date: at("2026-08-20"),
    });

    const hierarchy = buildTimelineHierarchy([e, task], [s]);

    expect(hierarchy.epics[0].tasks[0].item.start).toBe("2026-08-01");
  });

  it("matches the Sprint's end exactly", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      sprint_id: "s-1",
      start_date: at("2026-08-15"),
      due_date: at("2026-08-20"),
    });

    const hierarchy = buildTimelineHierarchy([e, task], [s]);

    expect(hierarchy.epics[0].tasks[0].item.end).toBe("2026-09-01");
  });

  it("changing the Sprint's dates changes the bound Task's range with it", () => {
    const e = epic({ id: "e-1" });
    const task = todo({ id: "t-1", parent_id: "e-1", sprint_id: "s-1" });

    const before = buildTimelineHierarchy(
      [e, task],
      [
        sprint({
          id: "s-1",
          start_date: at("2026-08-01"),
          end_date: at("2026-08-14"),
        }),
      ],
    );

    const after = buildTimelineHierarchy(
      [e, task],
      [
        sprint({
          id: "s-1",
          start_date: at("2026-09-01"),
          end_date: at("2026-09-30"),
        }),
      ],
    );

    expect(before.epics[0].tasks[0].item).toMatchObject({
      start: "2026-08-01",
      end: "2026-08-14",
    });
    expect(after.epics[0].tasks[0].item).toMatchObject({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("a Task without a Sprint keeps its own dates, unaffected by any Sprint present", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });
    const e = epic({ id: "e-1" });
    const unplanned = todo({
      id: "t-1",
      parent_id: "e-1",
      sprint_id: null,
      start_date: at("2026-01-01"),
      due_date: at("2026-01-05"),
    });

    const hierarchy = buildTimelineHierarchy([e, unplanned], [s]);
    const row = hierarchy.epics[0].tasks[0];

    expect(row.item).toMatchObject({ start: "2026-01-01", end: "2026-01-05" });
    expect(row.sprintBound).toBe(false);
  });

  it("a Task whose Sprint has no usable range is not bound -- own dates win", () => {
    // The Sprint exists and is named, but is missing a date -- the same rule
    // that keeps it off the Timeline as its own row (above) also means it
    // gives nothing to clamp a Task to.
    const s = sprint({ id: "s-1", start_date: at("2026-08-01") }); // no end_date
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      sprint_id: "s-1",
      start_date: at("2026-01-01"),
      due_date: at("2026-01-05"),
    });

    const hierarchy = buildTimelineHierarchy([e, task], [s]);
    const row = hierarchy.epics[0].tasks[0];

    expect(row.item).toMatchObject({ start: "2026-01-01", end: "2026-01-05" });
    expect(row.sprintBound).toBe(false);
  });

  it("a derived Epic rollup reflects its Sprint-bound child's clamped range, not its stored one", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });
    const e = epic({ id: "e-1" });
    const task = todo({
      id: "t-1",
      parent_id: "e-1",
      sprint_id: "s-1",
      start_date: at("2026-01-01"),
      due_date: at("2026-01-02"),
    });

    const hierarchy = buildTimelineHierarchy([e, task], [s]);

    expect(hierarchy.epics[0].item).toMatchObject({
      start: "2026-08-01",
      end: "2026-09-01",
    });
    expect(hierarchy.epics[0].isDerived).toBe(true);
  });
});

describe("undatedTimelineTodos — Sprint-bound Tasks", () => {
  it("excludes a Sprint-bound Task with no dates of its own -- it has a range now", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-01"),
      end_date: at("2026-09-01"),
    });
    const e = epic({ id: "e-1" });
    const bound = todo({ id: "t-1", parent_id: "e-1", sprint_id: "s-1" });

    expect(undatedTimelineTodos([e, bound], [s])).toHaveLength(0);
  });

  it("still lists an undated Task whose Sprint has no usable range", () => {
    const s = sprint({ id: "s-1", start_date: at("2026-08-01") }); // no end
    const e = epic({ id: "e-1" });
    const task = todo({ id: "t-1", parent_id: "e-1", sprint_id: "s-1" });

    expect(undatedTimelineTodos([e, task], [s]).map((t) => t.id)).toEqual([
      "t-1",
    ]);
  });

  it("defaults to the pre-Sprint behaviour when the argument is omitted", () => {
    const e = epic({ id: "e-1" });
    const child = todo({ id: "t-1", parent_id: "e-1" });

    expect(undatedTimelineTodos([e, child]).map((t) => t.id)).toEqual(["t-1"]);
  });
});

describe("placeTimelineHierarchy — Sprint rows", () => {
  const ticks = timelineTicks("weeks", "2026-08-17"); // 2026-08-17 .. 09-27

  it("places a Sprint whose range intersects the window", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-18"),
      end_date: at("2026-08-25"),
    });

    const hierarchy = buildTimelineHierarchy([], [s]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(placed.sprints).toHaveLength(1);
    expect(placed.sprints[0].item.sprint.id).toBe("s-1");
  });

  it("drops a Sprint entirely outside the window -- no fallback row", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-01-01"),
      end_date: at("2026-01-14"),
    });

    const hierarchy = buildTimelineHierarchy([], [s]);
    const placed = placeTimelineHierarchy(hierarchy, ticks, "weeks");

    expect(placed.sprints).toHaveLength(0);
  });
});

/**
 * The Sprints band is one row, so where two bars meet on it is a real
 * question — see `packSprintLanes` and `TimelineSprintBand`.
 */
describe("placeTimelineHierarchy — Sprint lanes and angled ends", () => {
  // Day-per-column, so a column index is a day offset from 2026-08-17.
  const ticks = timelineTicks("weeks", "2026-08-17"); // 2026-08-17 .. 09-27

  const placeAll = (sprints: Sprint[]) =>
    placeTimelineHierarchy(
      buildTimelineHierarchy([], sprints),
      ticks,
      "weeks",
    ).sprints;

  it("keeps every non-overlapping Sprint on one lane", () => {
    const first = sprint({
      id: "s-1",
      start_date: at("2026-08-17"),
      end_date: at("2026-08-20"),
    });
    const second = sprint({
      id: "s-2",
      start_date: at("2026-08-25"),
      end_date: at("2026-08-28"),
    });

    expect(placeAll([first, second]).map((s) => s.lane)).toEqual([0, 0]);
  });

  it("angles the join where one Sprint ends exactly where the next begins", () => {
    const first = sprint({
      id: "s-1",
      start_date: at("2026-08-17"),
      end_date: at("2026-08-20"),
    });
    // Begins the very next day, so the two bars abut with no empty column.
    const second = sprint({
      id: "s-2",
      start_date: at("2026-08-21"),
      end_date: at("2026-08-24"),
    });

    const placed = placeAll([first, second]);

    expect(placed[0]).toMatchObject({ angledStart: false, angledEnd: true });
    expect(placed[1]).toMatchObject({ angledStart: true, angledEnd: false });
  });

  it("leaves both ends square when a gap separates two Sprints", () => {
    const first = sprint({
      id: "s-1",
      start_date: at("2026-08-17"),
      end_date: at("2026-08-20"),
    });
    const second = sprint({
      id: "s-2",
      start_date: at("2026-08-25"),
      end_date: at("2026-08-28"),
    });

    const placed = placeAll([first, second]);

    expect(placed[0]).toMatchObject({ angledStart: false, angledEnd: false });
    expect(placed[1]).toMatchObject({ angledStart: false, angledEnd: false });
  });

  it("stacks a genuinely overlapping Sprint onto a second lane", () => {
    const first = sprint({
      id: "s-1",
      start_date: at("2026-08-17"),
      end_date: at("2026-08-28"),
    });
    const overlapping = sprint({
      id: "s-2",
      start_date: at("2026-08-20"),
      end_date: at("2026-09-01"),
    });

    const placed = placeAll([first, overlapping]);

    expect(placed.map((s) => s.lane)).toEqual([0, 1]);
    // Different lanes never touch, so neither end is cut.
    expect(placed[0].angledEnd).toBe(false);
    expect(placed[1].angledStart).toBe(false);
  });

  it("reuses lane 0 once an overlapping run has cleared it", () => {
    const first = sprint({
      id: "s-1",
      start_date: at("2026-08-17"),
      end_date: at("2026-08-24"),
    });
    const overlapping = sprint({
      id: "s-2",
      start_date: at("2026-08-20"),
      end_date: at("2026-08-27"),
    });
    // Starts after `first` has ended, so lane 0 is free again for it.
    const later = sprint({
      id: "s-3",
      start_date: at("2026-09-01"),
      end_date: at("2026-09-04"),
    });

    expect(placeAll([first, overlapping, later]).map((s) => s.lane)).toEqual([
      0, 1, 0,
    ]);
  });
});
