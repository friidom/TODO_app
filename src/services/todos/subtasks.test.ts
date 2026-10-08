import { describe, expect, it } from "vitest";

import {
  canBecomeSubtaskOf,
  canHaveSubtasks,
  canPickEpicParent,
  childrenOf,
  epicsOf,
  epicTaskProgress,
  isEpic,
  isGenuineSubtask,
  NO_SUBTASKS,
  parentOf,
  subtaskProgress,
  subtaskProgressByParent,
  subtaskCandidates,
  subtasksByParent,
  topLevelTodos,
} from "./subtasks";
import { doneStatusIds } from "@/services/workflow/statuses";
import type { IStatus, Todo } from "@/types/data";

const todo = (over: Partial<Todo> & { id: string }): Todo =>
  ({
    board_id: "board-1",
    status_id: "st-todo",
    parent_id: null,
    type: "Task",
    created_at: "2026-08-28T10:00:00.000Z",
    title: `todo ${over.id}`,
    ...over,
  }) as Todo;

const epic = (over: Partial<Todo> & { id: string }): Todo =>
  todo({ parent_id: null, ...over, type: "Epic" });

const status = (id: string, category: IStatus["category"]): IStatus =>
  ({
    id,
    category,
    board_id: "board-1",
    column_id: `column-of-${id}`,
    name: id,
    rank: 1024,
    is_hidden: false,
  }) as IStatus;

const STATUSES = [
  status("st-todo", "todo"),
  status("st-doing", "in_progress"),
  status("st-done", "done"),
];

describe("isEpic", () => {
  it("is true only for the Epic type", () => {
    expect(isEpic(todo({ id: "a", type: "Epic" }))).toBe(true);
    expect(isEpic(todo({ id: "a", type: "Task" }))).toBe(false);
    expect(isEpic(todo({ id: "a", type: "Bug" }))).toBe(false);
  });
});

describe("parentOf", () => {
  it("is null for a root item", () => {
    expect(parentOf([], todo({ id: "a" }))).toBeNull();
  });

  it("resolves the parent from the board's array", () => {
    const parent = todo({ id: "a" });
    const child = todo({ id: "b", parent_id: "a" });

    expect(parentOf([parent, child], child)).toBe(parent);
  });

  it("is null, not a throw, when the parent is not (yet) in the array", () => {
    const child = todo({ id: "b", parent_id: "missing" });

    expect(parentOf([child], child)).toBeNull();
  });
});

describe("isGenuineSubtask / canHaveSubtasks / canPickEpicParent", () => {
  it("treats a null parent as a normal top-level task", () => {
    const task = todo({ id: "a" });

    expect(isGenuineSubtask([task], task)).toBe(false);
    expect(canHaveSubtasks([task], task)).toBe(true);
    expect(canPickEpicParent([task], task)).toBe(true);
  });

  it("treats a Task-parented row as a genuine subtask", () => {
    const parent = todo({ id: "a" });
    const child = todo({ id: "b", parent_id: "a" });
    const todos = [parent, child];

    expect(isGenuineSubtask(todos, child)).toBe(true);
  });

  it("refuses to let a genuine subtask own subtasks — the two-level rule", () => {
    const parent = todo({ id: "a" });
    const child = todo({ id: "b", parent_id: "a" });
    const todos = [parent, child];

    expect(canHaveSubtasks(todos, child)).toBe(false);
  });

  it("refuses a genuine subtask an Epic parent field entirely", () => {
    const parent = todo({ id: "a" });
    const child = todo({ id: "b", parent_id: "a" });
    const todos = [parent, child];

    expect(canPickEpicParent(todos, child)).toBe(false);
  });

  it("does NOT treat an Epic-parented row as a subtask — it is a Task", () => {
    const anEpic = epic({ id: "e" });
    const task = todo({ id: "a", parent_id: "e" });
    const todos = [anEpic, task];

    expect(isGenuineSubtask(todos, task)).toBe(false);
    expect(canHaveSubtasks(todos, task)).toBe(true);
    expect(canPickEpicParent(todos, task)).toBe(true);
  });

  it("never lets an Epic have subtasks or pick a parent of its own", () => {
    const anEpic = epic({ id: "e" });

    expect(canHaveSubtasks([anEpic], anEpic)).toBe(false);
    expect(canPickEpicParent([anEpic], anEpic)).toBe(false);
  });
});

describe("childrenOf", () => {
  it("returns nothing for a parent with no children", () => {
    const todos = [todo({ id: "a" }), todo({ id: "b" })];

    expect(childrenOf(todos, "a")).toEqual([]);
  });

  it("returns every child of one parent", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b", parent_id: "a" }),
      todo({ id: "c", parent_id: "a" }),
    ];

    expect(childrenOf(todos, "a").map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("does not mix one parent's children into another's", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b" }),
      todo({ id: "a1", parent_id: "a" }),
      todo({ id: "b1", parent_id: "b" }),
    ];

    expect(childrenOf(todos, "a").map((t) => t.id)).toEqual(["a1"]);
    expect(childrenOf(todos, "b").map((t) => t.id)).toEqual(["b1"]);
  });

  it("is the same lookup for an Epic's Tasks as for a Task's Subtasks", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t1", parent_id: "e" }),
      todo({ id: "t2", parent_id: "e" }),
    ];

    expect(childrenOf(todos, "e").map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("orders children oldest first", () => {
    const todos = [
      todo({ id: "a" }),
      todo({
        id: "newer",
        parent_id: "a",
        created_at: "2026-08-28T12:00:00.000Z",
      }),
      todo({
        id: "older",
        parent_id: "a",
        created_at: "2026-08-28T09:00:00.000Z",
      }),
    ];

    expect(childrenOf(todos, "a").map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("breaks a timestamp tie by id, so the order is total", () => {
    const at = "2026-08-28T10:00:00.000Z";
    const todos = [
      todo({ id: "a" }),
      todo({ id: "z", parent_id: "a", created_at: at }),
      todo({ id: "b", parent_id: "a", created_at: at }),
    ];

    expect(childrenOf(todos, "a").map((t) => t.id)).toEqual(["b", "z"]);
  });

  it("does not mutate its input", () => {
    const todos = [
      todo({ id: "a" }),
      todo({
        id: "newer",
        parent_id: "a",
        created_at: "2026-08-28T12:00:00.000Z",
      }),
      todo({
        id: "older",
        parent_id: "a",
        created_at: "2026-08-28T09:00:00.000Z",
      }),
    ];
    const order = todos.map((t) => t.id);

    childrenOf(todos, "a");

    expect(todos.map((t) => t.id)).toEqual(order);
  });
});

describe("epicsOf", () => {
  it("returns only the Epic-typed rows", () => {
    const todos = [
      epic({ id: "e1" }),
      todo({ id: "a", type: "Task" }),
      epic({ id: "e2" }),
      todo({ id: "b", type: "Bug" }),
    ];

    expect(epicsOf(todos).map((t) => t.id)).toEqual(["e1", "e2"]);
  });

  it("is empty on a board with no epics", () => {
    expect(epicsOf([todo({ id: "a" })])).toEqual([]);
  });
});

describe("topLevelTodos", () => {
  it("drops genuine subtasks, which is what keeps them off the board", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b", parent_id: "a" }),
      todo({ id: "c" }),
    ];

    expect(topLevelTodos(todos).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("keeps a Task assigned to an Epic — it is a real card, not a subtask", () => {
    const todos = [epic({ id: "e" }), todo({ id: "t", parent_id: "e" })];

    expect(topLevelTodos(todos).map((t) => t.id)).toEqual(["e", "t"]);
  });

  it("still hides a genuine subtask of a Task that itself sits under an Epic", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t", parent_id: "e" }),
      todo({ id: "s", parent_id: "t" }),
    ];

    expect(topLevelTodos(todos).map((t) => t.id)).toEqual(["e", "t"]);
  });

  it("defaults to visible when the parent is not (yet) in the array", () => {
    const orphan = todo({ id: "b", parent_id: "missing" });

    expect(topLevelTodos([orphan]).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("subtasksByParent", () => {
  const ids = (map: Map<string, Todo[]>) =>
    Object.fromEntries([...map].map(([key, rows]) => [key, rows.map((t) => t.id)]));

  it("files each genuine subtask under its parent, oldest first", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "late", parent_id: "a", created_at: "2026-08-29T00:00:00.000Z" }),
      todo({ id: "early", parent_id: "a", created_at: "2026-08-27T00:00:00.000Z" }),
      todo({ id: "c" }),
      todo({ id: "d", parent_id: "c" }),
    ];

    expect(ids(subtasksByParent(todos))).toEqual({
      a: ["early", "late"],
      c: ["d"],
    });
  });

  it("leaves an Epic's Tasks out — they are top-level rows already", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t", parent_id: "e" }),
      todo({ id: "s", parent_id: "t" }),
    ];

    expect(ids(subtasksByParent(todos))).toEqual({ t: ["s"] });
  });

  it("is exactly what topLevelTodos drops, so nesting shows every row once", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t", parent_id: "e" }),
      todo({ id: "s", parent_id: "t" }),
      todo({ id: "orphan", parent_id: "missing" }),
      todo({ id: "a" }),
      todo({ id: "b", parent_id: "a" }),
    ];

    const nested = [...subtasksByParent(todos).values()].flat();
    const shown = [...topLevelTodos(todos), ...nested].map((t) => t.id);

    expect(shown.sort()).toEqual(todos.map((t) => t.id).sort());
  });
});

describe("doneStatusIds", () => {
  it("collects only the statuses categorised done", () => {
    expect([...doneStatusIds(STATUSES)]).toEqual(["st-done"]);
  });

  it("is empty for a board with no done status", () => {
    expect(doneStatusIds([status("only", "todo")]).size).toBe(0);
  });
});

describe("subtaskProgress", () => {
  const done = doneStatusIds(STATUSES);

  it("reports nothing for a task with no subtasks", () => {
    expect(subtaskProgress([], done)).toEqual(NO_SUBTASKS);
  });

  it("counts 0 of 1 for a single unfinished subtask", () => {
    const subtasks = [todo({ id: "b", parent_id: "a", status_id: "st-todo" })];

    expect(subtaskProgress(subtasks, done)).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    });
  });

  it("counts 1 of 3, matching the Jira reference's progress label", () => {
    const subtasks = [
      todo({ id: "b", parent_id: "a", status_id: "st-done" }),
      todo({ id: "c", parent_id: "a", status_id: "st-doing" }),
      todo({ id: "d", parent_id: "a", status_id: "st-todo" }),
    ];

    expect(subtaskProgress(subtasks, done)).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    });
  });

  it("counts every subtask done as 100%", () => {
    const subtasks = [
      todo({ id: "b", parent_id: "a", status_id: "st-done" }),
      todo({ id: "c", parent_id: "a", status_id: "st-done" }),
    ];

    expect(subtaskProgress(subtasks, done)).toEqual({
      done: 2,
      total: 2,
      percent: 100,
    });
  });

  it("derives doneness from the status's category, never a field", () => {
    const inProgress = todo({
      id: "b",
      parent_id: "a",
      status_id: "st-doing",
    });

    expect(subtaskProgress([inProgress], done).done).toBe(0);

    expect(
      subtaskProgress([{ ...inProgress, status_id: "st-done" }], done).done,
    ).toBe(1);
  });

  it("does not count a subtask with no status as done", () => {
    const subtasks = [todo({ id: "b", parent_id: "a", status_id: null })];

    expect(subtaskProgress(subtasks, done).done).toBe(0);
  });
});

describe("subtaskProgressByParent", () => {
  it("omits parents that have no children, so no indicator is drawn", () => {
    const todos = [todo({ id: "a" }), todo({ id: "b" })];

    expect(subtaskProgressByParent(todos, STATUSES).size).toBe(0);
  });

  it("counts each parent's own children separately", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b" }),
      todo({ id: "a1", parent_id: "a", status_id: "st-done" }),
      todo({ id: "a2", parent_id: "a", status_id: "st-todo" }),
      todo({ id: "b1", parent_id: "b", status_id: "st-todo" }),
    ];

    const progress = subtaskProgressByParent(todos, STATUSES);

    expect(progress.get("a")).toEqual({ done: 1, total: 2, percent: 50 });
    expect(progress.get("b")).toEqual({ done: 0, total: 1, percent: 0 });
  });

  it("agrees with subtaskProgress computed one parent at a time", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "a1", parent_id: "a", status_id: "st-done" }),
      todo({ id: "a2", parent_id: "a", status_id: "st-doing" }),
      todo({ id: "a3", parent_id: "a", status_id: "st-todo" }),
    ];

    expect(subtaskProgressByParent(todos, STATUSES).get("a")).toEqual(
      subtaskProgress(childrenOf(todos, "a"), doneStatusIds(STATUSES)),
    );
  });

  it("survives a board with no done status", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "a1", parent_id: "a", status_id: "st-todo" }),
    ];

    expect(
      subtaskProgressByParent(todos, [status("st-todo", "todo")]),
    ).toEqual(new Map([["a", { done: 0, total: 1, percent: 0 }]]));
  });

  it("does not create an entry for an Epic from its own Tasks", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t1", parent_id: "e", status_id: "st-done" }),
      todo({ id: "t2", parent_id: "e", status_id: "st-todo" }),
    ];

    expect(subtaskProgressByParent(todos, STATUSES).size).toBe(0);
  });

  it("still counts a Task-under-Epic's own genuine subtasks", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t", parent_id: "e" }),
      todo({ id: "s1", parent_id: "t", status_id: "st-done" }),
      todo({ id: "s2", parent_id: "t", status_id: "st-todo" }),
    ];

    const progress = subtaskProgressByParent(todos, STATUSES);

    expect(progress.get("t")).toEqual({ done: 1, total: 2, percent: 50 });
    expect(progress.has("e")).toBe(false);
  });
});

describe("epicTaskProgress", () => {
  it("omits an Epic with no Tasks", () => {
    const todos = [epic({ id: "e" })];

    expect(epicTaskProgress(todos, STATUSES).size).toBe(0);
  });

  it("counts 2 of 4, matching the milestone's own example", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t1", parent_id: "e", status_id: "st-done" }),
      todo({ id: "t2", parent_id: "e", status_id: "st-done" }),
      todo({ id: "t3", parent_id: "e", status_id: "st-doing" }),
      todo({ id: "t4", parent_id: "e", status_id: "st-todo" }),
    ];

    expect(epicTaskProgress(todos, STATUSES).get("e")).toEqual({
      done: 2,
      total: 4,
      percent: 50,
    });
  });

  it("does not count a Task's own genuine subtasks toward its Epic", () => {
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t", parent_id: "e", status_id: "st-todo" }),
      todo({ id: "s", parent_id: "t", status_id: "st-done" }),
    ];

    expect(epicTaskProgress(todos, STATUSES).get("e")).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    });
  });

  it("counts each Epic's own Tasks separately", () => {
    const todos = [
      epic({ id: "e1" }),
      epic({ id: "e2" }),
      todo({ id: "a1", parent_id: "e1", status_id: "st-done" }),
      todo({ id: "a2", parent_id: "e1", status_id: "st-todo" }),
      todo({ id: "b1", parent_id: "e2", status_id: "st-todo" }),
    ];

    const progress = epicTaskProgress(todos, STATUSES);

    expect(progress.get("e1")).toEqual({ done: 1, total: 2, percent: 50 });
    expect(progress.get("e2")).toEqual({ done: 0, total: 1, percent: 0 });
  });

  it("does not count a top-level Task toward any Epic", () => {
    const todos = [epic({ id: "e" }), todo({ id: "solo" })];

    expect(epicTaskProgress(todos, STATUSES).size).toBe(0);
  });
});

describe("canBecomeSubtaskOf", () => {
  const parent = todo({ id: "parent" });

  it("accepts a plain top-level task", () => {
    const candidate = todo({ id: "c" });

    expect(canBecomeSubtaskOf([parent, candidate], candidate, parent)).toBe(
      true,
    );
  });

  it("refuses the parent itself", () => {
    expect(canBecomeSubtaskOf([parent], parent, parent)).toBe(false);
  });

  it("refuses a card that is already its child", () => {
    const child = todo({ id: "c", parent_id: "parent" });

    expect(canBecomeSubtaskOf([parent, child], child, parent)).toBe(false);
  });

  it("refuses an Epic", () => {
    const anEpic = epic({ id: "e" });

    expect(canBecomeSubtaskOf([parent, anEpic], anEpic, parent)).toBe(false);
  });

  it("refuses a card that has subtasks of its own", () => {
    const candidate = todo({ id: "c" });
    const grandchild = todo({ id: "g", parent_id: "c" });

    expect(
      canBecomeSubtaskOf([parent, candidate, grandchild], candidate, parent),
    ).toBe(false);
  });

  it("refuses the card the parent itself sits under", () => {
    const top = todo({ id: "top" });
    const nested = todo({ id: "nested", parent_id: "top" });

    expect(canBecomeSubtaskOf([top, nested], top, nested)).toBe(false);
  });

  it("refuses when the parent is itself a subtask", () => {
    const top = todo({ id: "top" });
    const nested = todo({ id: "nested", parent_id: "top" });
    const candidate = todo({ id: "c" });

    expect(
      canBecomeSubtaskOf([top, nested, candidate], candidate, nested),
    ).toBe(false);
  });

  it("accepts a task that sits under an Epic, and a subtask of another task", () => {
    const anEpic = epic({ id: "e" });
    const underEpic = todo({ id: "u", parent_id: "e" });
    const other = todo({ id: "o" });
    const sibling = todo({ id: "s", parent_id: "o" });
    const todos = [parent, anEpic, underEpic, other, sibling];

    expect(canBecomeSubtaskOf(todos, underEpic, parent)).toBe(true);
    expect(canBecomeSubtaskOf(todos, sibling, parent)).toBe(true);
  });
});

describe("subtaskCandidates", () => {
  it("agrees with canBecomeSubtaskOf for every card on the board", () => {
    const parent = todo({ id: "parent" });
    const anEpic = epic({ id: "e" });
    const todos = [
      parent,
      anEpic,
      todo({ id: "plain" }),
      todo({ id: "child", parent_id: "parent" }),
      todo({ id: "holder" }),
      todo({ id: "held", parent_id: "holder" }),
      todo({ id: "tasked", parent_id: "e" }),
    ];

    const expected = todos
      .filter((candidate) => canBecomeSubtaskOf(todos, candidate, parent))
      .map((candidate) => candidate.id);

    expect(subtaskCandidates(todos, parent).map((row) => row.id)).toEqual(
      expected,
    );
    expect(expected).toEqual(["plain", "held", "tasked"]);
  });

  it("offers nothing under a parent that is itself a subtask", () => {
    const top = todo({ id: "top" });
    const nested = todo({ id: "nested", parent_id: "top" });

    expect(subtaskCandidates([top, nested, todo({ id: "x" })], nested)).toEqual(
      [],
    );
  });
});
