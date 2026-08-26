import { describe, expect, it } from "vitest";

import {
  canHaveSubtasks,
  canPickEpicParent,
  childrenOf,
  doneColumnIds,
  epicsOf,
  isEpic,
  isGenuineSubtask,
  NO_SUBTASKS,
  parentOf,
  subtaskProgress,
  subtaskProgressByParent,
  topLevelTodos,
} from "./subtasks";
import type { IColumn, Todo } from "@/types/data";

const todo = (over: Partial<Todo> & { id: string }): Todo =>
  ({
    board_id: "board-1",
    column_id: "col-todo",
    parent_id: null,
    type: "Task",
    created_at: "2026-08-28T10:00:00.000Z",
    title: `todo ${over.id}`,
    ...over,
  }) as Todo;

const epic = (over: Partial<Todo> & { id: string }): Todo =>
  todo({ parent_id: null, ...over, type: "Epic" });

const column = (id: string, category: string): IColumn =>
  ({ id, category, board_id: "board-1", title: id }) as IColumn;

const COLUMNS = [
  column("col-todo", "todo"),
  column("col-doing", "in_progress"),
  column("col-done", "done"),
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
    // A transient cache gap must never read as an invalid hierarchy — every
    // caller treats this the same as "no parent".
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
    // The UI half of `enforce_work_item_hierarchy`: a subtask must not be
    // offered an "Add subtask" action, because the database would refuse it.
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
    // The whole reason M28-A needed no second relationship mechanism: "who
    // are this row's children" is one question regardless of what the row is.
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
    // A transient cache gap must never silently remove a real card.
    const orphan = todo({ id: "b", parent_id: "missing" });

    expect(topLevelTodos([orphan]).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("doneColumnIds", () => {
  it("collects only the columns categorised done", () => {
    expect([...doneColumnIds(COLUMNS)]).toEqual(["col-done"]);
  });

  it("is empty for a board with no done column", () => {
    expect(doneColumnIds([column("only", "todo")]).size).toBe(0);
  });
});

describe("subtaskProgress", () => {
  const done = doneColumnIds(COLUMNS);

  it("reports nothing for a task with no subtasks", () => {
    expect(subtaskProgress([], done)).toEqual(NO_SUBTASKS);
  });

  it("counts 0 of 1 for a single unfinished subtask", () => {
    const subtasks = [todo({ id: "b", parent_id: "a", column_id: "col-todo" })];

    expect(subtaskProgress(subtasks, done)).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    });
  });

  it("counts 1 of 3, matching the Jira reference's progress label", () => {
    const subtasks = [
      todo({ id: "b", parent_id: "a", column_id: "col-done" }),
      todo({ id: "c", parent_id: "a", column_id: "col-doing" }),
      todo({ id: "d", parent_id: "a", column_id: "col-todo" }),
    ];

    expect(subtaskProgress(subtasks, done)).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    });
  });

  it("counts every subtask done as 100%", () => {
    const subtasks = [
      todo({ id: "b", parent_id: "a", column_id: "col-done" }),
      todo({ id: "c", parent_id: "a", column_id: "col-done" }),
    ];

    expect(subtaskProgress(subtasks, done)).toEqual({
      done: 2,
      total: 2,
      percent: 100,
    });
  });

  it("derives doneness from the column's category, never a field", () => {
    // M2-15's rule, which this milestone inherits rather than reinterprets:
    // there is no completion flag on a row. Moving a subtask into the done
    // column is the only thing that completes it.
    const inProgress = todo({
      id: "b",
      parent_id: "a",
      column_id: "col-doing",
    });

    expect(subtaskProgress([inProgress], done).done).toBe(0);

    expect(
      subtaskProgress([{ ...inProgress, column_id: "col-done" }], done).done,
    ).toBe(1);
  });

  it("does not count a subtask with no column as done", () => {
    const subtasks = [todo({ id: "b", parent_id: "a", column_id: null })];

    expect(subtaskProgress(subtasks, done).done).toBe(0);
  });
});

describe("subtaskProgressByParent", () => {
  it("omits parents that have no children, so no indicator is drawn", () => {
    const todos = [todo({ id: "a" }), todo({ id: "b" })];

    expect(subtaskProgressByParent(todos, COLUMNS).size).toBe(0);
  });

  it("counts each parent's own children separately", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b" }),
      todo({ id: "a1", parent_id: "a", column_id: "col-done" }),
      todo({ id: "a2", parent_id: "a", column_id: "col-todo" }),
      todo({ id: "b1", parent_id: "b", column_id: "col-todo" }),
    ];

    const progress = subtaskProgressByParent(todos, COLUMNS);

    expect(progress.get("a")).toEqual({ done: 1, total: 2, percent: 50 });
    expect(progress.get("b")).toEqual({ done: 0, total: 1, percent: 0 });
  });

  it("agrees with subtaskProgress computed one parent at a time", () => {
    // The two exist for different call sites — one map for the board, one
    // count for the open panel — and they must never disagree about a number
    // the user can see in both places at once.
    const todos = [
      todo({ id: "a" }),
      todo({ id: "a1", parent_id: "a", column_id: "col-done" }),
      todo({ id: "a2", parent_id: "a", column_id: "col-doing" }),
      todo({ id: "a3", parent_id: "a", column_id: "col-todo" }),
    ];

    expect(subtaskProgressByParent(todos, COLUMNS).get("a")).toEqual(
      subtaskProgress(childrenOf(todos, "a"), doneColumnIds(COLUMNS)),
    );
  });

  it("survives a board with no done column", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "a1", parent_id: "a", column_id: "col-todo" }),
    ];

    expect(
      subtaskProgressByParent(todos, [column("col-todo", "todo")]),
    ).toEqual(new Map([["a", { done: 0, total: 1, percent: 0 }]]));
  });

  it("does not create an entry for an Epic from its own Tasks", () => {
    // A Task under an Epic is not a Subtask, so it must not feed the Epic's
    // count here — the plan defers an Epic's own progress bar to M31.
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t1", parent_id: "e", column_id: "col-done" }),
      todo({ id: "t2", parent_id: "e", column_id: "col-todo" }),
    ];

    expect(subtaskProgressByParent(todos, COLUMNS).size).toBe(0);
  });

  it("still counts a Task-under-Epic's own genuine subtasks", () => {
    // The Task occupies the Task position regardless of who its parent is,
    // so it must still show a progress bar for ITS children.
    const todos = [
      epic({ id: "e" }),
      todo({ id: "t", parent_id: "e" }),
      todo({ id: "s1", parent_id: "t", column_id: "col-done" }),
      todo({ id: "s2", parent_id: "t", column_id: "col-todo" }),
    ];

    const progress = subtaskProgressByParent(todos, COLUMNS);

    expect(progress.get("t")).toEqual({ done: 1, total: 2, percent: 50 });
    expect(progress.has("e")).toBe(false);
  });
});
