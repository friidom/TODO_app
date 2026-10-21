import { describe, expect, it } from "vitest";

import type { Sprint, Todo } from "@/types/data";
import { timelineTicks } from "./timeline";
import {
  autoSlots,
  branchIds,
  buildTimelineHierarchy,
  flattenTimeline,
  placeSprints,
  schedulePatches,
  timelineCounts,
  type TimelineNode,
} from "./timelineHierarchy";

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    status_id: "s-1",
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

function at(day: string): string {
  return `${day}T00:00:00.000Z`;
}

const dated = (start: string, end: string) => ({
  start_date: at(start),
  due_date: at(end),
});

const build = (todos: Todo[], subtasks = new Map<string, Todo[]>()) =>
  buildTimelineHierarchy(todos, { subtasks }).epics;

describe("autoSlots", () => {
  it("gives four children a 12-day parent's range three days each, in order", () => {
    expect(autoSlots({ start: "2026-10-01", end: "2026-10-12" }, 4)).toEqual([
      { start: "2026-10-01", end: "2026-10-03" },
      { start: "2026-10-04", end: "2026-10-06" },
      { start: "2026-10-07", end: "2026-10-09" },
      { start: "2026-10-10", end: "2026-10-12" },
    ]);
  });

  it("covers the parent exactly, a remainder going to the later slots", () => {
    const slots = autoSlots({ start: "2026-10-01", end: "2026-10-12" }, 5);

    expect(slots[0].start).toBe("2026-10-01");
    expect(slots.at(-1)!.end).toBe("2026-10-12");

    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i].start > slots[i - 1].end).toBe(true);
    }
  });

  it("shares days rather than spilling out when children outnumber days", () => {
    const slots = autoSlots({ start: "2026-10-01", end: "2026-10-02" }, 5);

    expect(slots).toHaveLength(5);

    for (const slot of slots) {
      expect(slot.start >= "2026-10-01" && slot.end <= "2026-10-02").toBe(true);
      expect(slot.start <= slot.end).toBe(true);
    }
  });
});

describe("buildTimelineHierarchy — rows", () => {
  it("gives every Epic a row, dated or not, and nests its Tasks under it", () => {
    const a = epic();
    const b = epic();
    const task = todo({ parent_id: a.id });

    const [first, second] = build([a, b, task]);

    expect(first.todo.id).toBe(a.id);
    expect(first.children.map((child) => child.todo.id)).toEqual([task.id]);
    expect(second.children).toEqual([]);
    expect(first.depth).toBe(0);
    expect(first.children[0].depth).toBe(1);
  });

  it("does not give a Task with no Epic a row — this view is the Epic breakdown", () => {
    const loose = todo(dated("2026-08-21", "2026-08-25"));

    expect(build([loose])).toEqual([]);
  });

  it("files a genuine Subtask under its Task, as the third level", () => {
    const e = epic(dated("2026-10-01", "2026-10-31"));
    const task = todo({ parent_id: e.id });
    const sub = todo({ parent_id: task.id });

    const [root] = build([e, task], new Map([[task.id, [sub]]]));

    expect(root.children[0].children.map((child) => child.todo.id)).toEqual([
      sub.id,
    ]);
    expect(root.children[0].children[0].depth).toBe(2);
  });

  it("keeps rows in creation order, so a bar dragged later does not jump rows", () => {
    const e = epic();
    const early = todo({
      parent_id: e.id,
      ...dated("2026-10-20", "2026-10-22"),
    });
    const late = todo({
      parent_id: e.id,
      ...dated("2026-10-01", "2026-10-03"),
    });

    expect(build([e, late, early])[0].children.map((c) => c.todo.id)).toEqual([
      early.id,
      late.id,
    ]);
  });
});

describe("buildTimelineHierarchy — where a range comes from", () => {
  it("uses an Epic's own dates over any rollup", () => {
    const e = epic(dated("2026-10-05", "2026-10-30"));
    todo({ parent_id: e.id });

    const [root] = build([
      e,
      todo({ parent_id: e.id, ...dated("2026-11-01", "2026-11-02") }),
    ]);

    expect(root.source).toBe("explicit");
    expect(root.range).toEqual({ start: "2026-10-05", end: "2026-10-30" });
  });

  it("derives an undated Epic from its dated children", () => {
    const e = epic();
    const a = todo({ parent_id: e.id, ...dated("2026-10-01", "2026-10-08") });
    const b = todo({ parent_id: e.id, ...dated("2026-10-10", "2026-10-14") });

    const [root] = build([e, a, b]);

    expect(root.source).toBe("derived");
    expect(root.range).toEqual({ start: "2026-10-01", end: "2026-10-14" });
  });

  it("reads a single date as a point, never as a range nobody set", () => {
    const e = epic({ due_date: at("2026-10-22") });

    expect(build([e])[0]).toMatchObject({
      source: "point",
      range: { start: "2026-10-22", end: "2026-10-22" },
    });
  });

  it("has nothing to go on with no dates anywhere", () => {
    const e = epic();
    const task = todo({ parent_id: e.id });

    const [root] = build([e, task]);

    expect(root.source).toBe("none");
    expect(root.range).toBeNull();
    expect(root.children[0].source).toBe("none");
  });

  it("never lends a Sprint's dates to the work planned into it", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-09-18"),
      end_date: at("2026-10-02"),
    });
    const e = epic(dated("2026-10-05", "2026-10-30"));
    const own = todo({
      parent_id: e.id,
      sprint_id: "s-1",
      ...dated("2026-10-12", "2026-10-20"),
    });
    const bare = todo({ parent_id: e.id, sprint_id: "s-1" });

    const [root] = buildTimelineHierarchy([e, own, bare], {
      sprints: [s],
    }).epics;

    expect(root.children[0].range).toEqual({
      start: "2026-10-12",
      end: "2026-10-20",
    });
    expect(root.children[0].source).toBe("explicit");
    expect(root.children[1].source).toBe("auto");
    expect(root.children[1].range!.start >= "2026-10-05").toBe(true);
  });
});

describe("buildTimelineHierarchy — auto-scheduled children", () => {
  it("shares a 12-day Epic between four undated children, about 3 days each", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const kids = [1, 2, 3, 4].map(() => todo({ parent_id: e.id }));

    const [root] = build([e, ...kids]);

    expect(root.children.map((child) => child.source)).toEqual([
      "auto",
      "auto",
      "auto",
      "auto",
    ]);
    expect(root.children.map((child) => child.range)).toEqual(
      autoSlots({ start: "2026-10-01", end: "2026-10-12" }, 4),
    );
  });

  it("re-flows when a fifth child arrives, and leaves a dated sibling alone", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const manual = todo({
      parent_id: e.id,
      ...dated("2026-10-02", "2026-10-03"),
    });
    const kids = [1, 2, 3, 4].map(() => todo({ parent_id: e.id }));

    const before = build([e, manual, ...kids.slice(0, 3)])[0];
    const after = build([e, manual, ...kids])[0];

    expect(before.children.filter((c) => c.source === "auto")).toHaveLength(3);
    expect(after.children.filter((c) => c.source === "auto")).toHaveLength(4);
    expect(after.children[0].range).toEqual({
      start: "2026-10-02",
      end: "2026-10-03",
    });
    expect(after.children[0].source).toBe("explicit");
  });

  it("follows its parent: a resized parent re-flows its auto children", () => {
    const narrow = epic(dated("2026-10-01", "2026-10-04"));
    const kid = todo({ parent_id: narrow.id });

    const wide = { ...narrow, ...dated("2026-10-01", "2026-10-20") };

    expect(build([narrow, kid])[0].children[0].range).toEqual({
      start: "2026-10-01",
      end: "2026-10-04",
    });
    expect(build([wide, kid])[0].children[0].range).toEqual({
      start: "2026-10-01",
      end: "2026-10-20",
    });
  });

  it("nests: a Subtask shares its auto-scheduled Task's own share", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const task = todo({ parent_id: e.id });
    const subs = [todo({ parent_id: task.id }), todo({ parent_id: task.id })];

    const [root] = build([e, task], new Map([[task.id, subs]]));
    const [first, second] = root.children[0].children;

    expect(root.children[0].range).toEqual({
      start: "2026-10-01",
      end: "2026-10-12",
    });
    expect(first.range).toEqual({ start: "2026-10-01", end: "2026-10-06" });
    expect(second.range).toEqual({ start: "2026-10-07", end: "2026-10-12" });
  });
});

describe("buildTimelineHierarchy — limits", () => {
  it("bounds a child by its parent's own dates", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const task = todo({
      parent_id: e.id,
      ...dated("2026-10-02", "2026-10-04"),
    });

    const [root] = build([e, task]);

    expect(root.children[0].limits.bounds).toEqual({
      start: "2026-10-01",
      end: "2026-10-12",
    });
    expect(root.limits.bounds).toEqual({ start: null, end: null });
  });

  it("bounds a Subtask by the nearest ancestor that has a date, side by side", () => {
    const e = epic(dated("2026-10-01", "2026-10-31"));
    const task = todo({ parent_id: e.id, due_date: at("2026-10-20") });
    const sub = todo({ parent_id: task.id });

    const [root] = build([e, task], new Map([[task.id, [sub]]]));

    expect(root.children[0].children[0].limits.bounds).toEqual({
      start: "2026-10-01",
      end: "2026-10-20",
    });
  });

  it("does not bound children by a parent's derived range", () => {
    const e = epic();
    const task = todo({
      parent_id: e.id,
      ...dated("2026-10-02", "2026-10-04"),
    });

    expect(build([e, task])[0].children[0].limits.bounds).toEqual({
      start: null,
      end: null,
    });
  });

  it("makes a parent's resize stop at the children that have dates of their own", () => {
    const e = epic(dated("2026-10-01", "2026-10-31"));
    const a = todo({ parent_id: e.id, ...dated("2026-10-05", "2026-10-09") });
    const b = todo({ parent_id: e.id, ...dated("2026-10-15", "2026-10-20") });
    const auto = todo({ parent_id: e.id });

    expect(build([e, a, b, auto])[0].limits.contain).toEqual({
      start: "2026-10-05",
      end: "2026-10-20",
    });
  });

  it("flags existing dates outside the parent without moving them", () => {
    const e = epic(dated("2026-10-05", "2026-10-30"));
    const stray = todo({
      parent_id: e.id,
      ...dated("2026-11-03", "2026-11-07"),
    });

    const [root] = build([e, stray]);

    expect(root.children[0].outside).toBe(true);
    expect(root.children[0].range).toEqual({
      start: "2026-11-03",
      end: "2026-11-07",
    });
    // an outlier is not what the parent's edge stops at
    expect(root.limits.contain).toBeNull();
  });
});

describe("schedulePatches", () => {
  const node = (todos: Todo[], subtasks?: Map<string, Todo[]>) =>
    build(todos, subtasks)[0];

  it("writes both dates for a resize or a move of a dated row", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const root = node([e]);

    expect(
      schedulePatches(
        root,
        root.range,
        { start: "2026-10-01", end: "2026-10-15" },
        "end",
      ),
    ).toEqual([{ id: e.id, board_id: "b-1", end: "2026-10-15" }]);
  });

  it("carries the whole branch on a move, keeping each length", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const task = todo({
      parent_id: e.id,
      ...dated("2026-10-02", "2026-10-04"),
    });
    const pointed = todo({ parent_id: e.id, due_date: at("2026-10-10") });
    const auto = todo({ parent_id: e.id });

    const root = node([e, task, pointed, auto]);
    const patches = schedulePatches(
      root,
      root.range,
      { start: "2026-10-08", end: "2026-10-19" },
      "move",
    );

    expect(patches).toHaveLength(3);
    expect(patches).toEqual(
      expect.arrayContaining([
        { id: e.id, board_id: "b-1", start: "2026-10-08", end: "2026-10-19" },
        {
          id: task.id,
          board_id: "b-1",
          start: "2026-10-09",
          end: "2026-10-11",
        },
        { id: pointed.id, board_id: "b-1", end: "2026-10-17" },
      ]),
    );
  });

  it("moves a derived row by moving its children, never inventing its own dates", () => {
    const e = epic();
    const task = todo({
      parent_id: e.id,
      ...dated("2026-10-02", "2026-10-04"),
    });
    const root = node([e, task]);

    expect(
      schedulePatches(
        root,
        root.range,
        { start: "2026-10-03", end: "2026-10-05" },
        "move",
      ),
    ).toEqual([
      { id: task.id, board_id: "b-1", start: "2026-10-03", end: "2026-10-05" },
    ]);
  });

  it("gives a derived row dates of its own when an edge is dragged", () => {
    const e = epic();
    const task = todo({
      parent_id: e.id,
      ...dated("2026-10-02", "2026-10-04"),
    });
    const root = node([e, task]);

    expect(
      schedulePatches(
        root,
        root.range,
        { start: "2026-10-02", end: "2026-10-09" },
        "end",
      ),
    ).toEqual([
      { id: e.id, board_id: "b-1", start: "2026-10-02", end: "2026-10-09" },
    ]);
  });

  it("never invents the missing half of a point on a move", () => {
    const e = epic({ due_date: at("2026-10-22") });
    const root = node([e]);

    expect(
      schedulePatches(
        root,
        root.range,
        { start: "2026-10-24", end: "2026-10-24" },
        "move",
      ),
    ).toEqual([{ id: e.id, board_id: "b-1", end: "2026-10-24" }]);
  });

  it("turns an auto row into a dated one, and a drawn one too", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const kid = todo({ parent_id: e.id });
    const root = node([e, kid]);
    const child = root.children[0];

    expect(
      schedulePatches(
        child,
        child.range,
        { start: "2026-10-03", end: "2026-10-14" },
        "move",
      ),
    ).toEqual([
      { id: kid.id, board_id: "b-1", start: "2026-10-03", end: "2026-10-14" },
    ]);

    const bare = node([epic()]);

    expect(
      schedulePatches(
        bare,
        null,
        { start: "2026-10-01", end: "2026-10-02" },
        "draw",
      ),
    ).toEqual([
      {
        id: bare.todo.id,
        board_id: "b-1",
        start: "2026-10-01",
        end: "2026-10-02",
      },
    ]);
  });

  it("writes nothing when a gesture ends where it began", () => {
    const e = epic(dated("2026-10-01", "2026-10-12"));
    const root = node([e]);

    expect(schedulePatches(root, root.range, root.range!, "move")).toEqual([]);
  });
});

describe("flattenTimeline / timelineCounts / branchIds", () => {
  const e = epic(dated("2026-10-01", "2026-10-12"));
  const task = todo({ parent_id: e.id });
  const sub = todo({ parent_id: task.id });
  const lonely = epic();
  const tree = build([e, task, lonely], new Map([[task.id, [sub]]]));

  it("hides a collapsed branch and shows an open one", () => {
    const ids = (open: string[]) =>
      flattenTimeline(tree, (node: TimelineNode) =>
        open.includes(node.todo.id),
      ).map((node) => node.todo.id);

    expect(ids([])).toEqual([e.id, lonely.id]);
    expect(ids([e.id])).toEqual([e.id, task.id, lonely.id]);
    expect(ids([e.id, task.id])).toEqual([e.id, task.id, sub.id, lonely.id]);
  });

  it("counts undated rows and rows outside the window", () => {
    const october = timelineTicks("weeks", "2026-10-05");
    const later = timelineTicks("weeks", "2027-03-01");

    expect(timelineCounts(tree, october, "weeks")).toEqual({
      undated: 1,
      offWindow: 0,
    });
    expect(timelineCounts(tree, later, "weeks")).toEqual({
      undated: 1,
      offWindow: 3,
    });
  });

  it("names every row a move of the root carries", () => {
    expect([...branchIds(tree[0])]).toEqual([task.id, sub.id]);
  });
});

describe("placeSprints — Sprint rows", () => {
  const ticks = timelineTicks("weeks", "2026-08-17"); // 2026-08-17 .. 09-27

  it("places a Sprint whose range intersects the window", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-08-18"),
      end_date: at("2026-08-25"),
    });

    const hierarchy = buildTimelineHierarchy([], { sprints: [s] });
    const placed = placeSprints(hierarchy.sprints, ticks, "weeks");

    expect(placed).toHaveLength(1);
    expect(placed[0].item.sprint.id).toBe("s-1");
  });

  it("drops a Sprint entirely outside the window -- no fallback row", () => {
    const s = sprint({
      id: "s-1",
      start_date: at("2026-01-01"),
      end_date: at("2026-01-14"),
    });

    const hierarchy = buildTimelineHierarchy([], { sprints: [s] });

    expect(placeSprints(hierarchy.sprints, ticks, "weeks")).toHaveLength(0);
  });
});

describe("placeSprints — Sprint lanes and angled ends", () => {
  const ticks = timelineTicks("weeks", "2026-08-17"); // 2026-08-17 .. 09-27

  const placeAll = (sprints: Sprint[]) =>
    placeSprints(
      buildTimelineHierarchy([], { sprints }).sprints,
      ticks,
      "weeks",
    );

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
    // begins the next day, so the two bars abut with no gap
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
    // different lanes never touch, so neither end is cut
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
    // starts after `first` has ended, so lane 0 is free again
    const later = sprint({
      id: "s-3",
      start_date: at("2026-09-01"),
      end_date: at("2026-09-04"),
    });

    expect(placeAll([first, overlapping, later]).map((s) => s.lane)).toEqual([
      0, 1, 0,
    ]);
  });

  it("hands over mid-week on one lane at the month scale, where both share a week column", () => {
    const first = sprint({
      id: "s-1",
      start_date: at("2026-08-03"),
      end_date: at("2026-08-12"),
    });
    const second = sprint({
      id: "s-2",
      start_date: at("2026-08-13"),
      end_date: at("2026-08-26"),
    });

    const placed = placeSprints(
      buildTimelineHierarchy([], { sprints: [first, second] }).sprints,
      timelineTicks("months", "2026-08-17"),
      "months",
    );

    expect(placed.map((s) => s.lane)).toEqual([0, 0]);
    expect(placed[0].angledEnd).toBe(true);
    expect(placed[1].angledStart).toBe(true);
  });
});
