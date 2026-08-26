import { describe, expect, it } from "vitest";

import {
  canHaveSubtasks,
  doneColumnIds,
  isSubtask,
  NO_SUBTASKS,
  subtaskProgress,
  subtaskProgressByParent,
  subtasksOf,
  topLevelTodos,
} from "./subtasks";
import type { IColumn, Todo } from "@/types/data";

const todo = (over: Partial<Todo> & { id: string }): Todo =>
  ({
    board_id: "board-1",
    column_id: "col-todo",
    parent_id: null,
    created_at: "2026-08-28T10:00:00.000Z",
    title: `todo ${over.id}`,
    ...over,
  }) as Todo;

const column = (id: string, category: string): IColumn =>
  ({ id, category, board_id: "board-1", title: id }) as IColumn;

const COLUMNS = [
  column("col-todo", "todo"),
  column("col-doing", "in_progress"),
  column("col-done", "done"),
];

describe("isSubtask / canHaveSubtasks", () => {
  it("treats a null parent as a normal top-level task", () => {
    expect(isSubtask(todo({ id: "a" }))).toBe(false);
    expect(canHaveSubtasks(todo({ id: "a" }))).toBe(true);
  });

  it("treats a named parent as a subtask", () => {
    const child = todo({ id: "b", parent_id: "a" });

    expect(isSubtask(child)).toBe(true);
  });

  it("refuses to let a subtask own subtasks — the two-level rule", () => {
    // The UI half of `enforce_subtask_depth`: a subtask must not be offered
    // an "Add subtask" action, because the database would refuse the write.
    const child = todo({ id: "b", parent_id: "a" });

    expect(canHaveSubtasks(child)).toBe(false);
  });
});

describe("subtasksOf", () => {
  it("returns nothing for a task with no children", () => {
    const todos = [todo({ id: "a" }), todo({ id: "b" })];

    expect(subtasksOf(todos, "a")).toEqual([]);
  });

  it("returns every child of one parent", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b", parent_id: "a" }),
      todo({ id: "c", parent_id: "a" }),
    ];

    expect(subtasksOf(todos, "a").map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("does not mix one parent's children into another's", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b" }),
      todo({ id: "a1", parent_id: "a" }),
      todo({ id: "b1", parent_id: "b" }),
    ];

    expect(subtasksOf(todos, "a").map((t) => t.id)).toEqual(["a1"]);
    expect(subtasksOf(todos, "b").map((t) => t.id)).toEqual(["b1"]);
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

    expect(subtasksOf(todos, "a").map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("breaks a timestamp tie by id, so the order is total", () => {
    const at = "2026-08-28T10:00:00.000Z";
    const todos = [
      todo({ id: "a" }),
      todo({ id: "z", parent_id: "a", created_at: at }),
      todo({ id: "b", parent_id: "a", created_at: at }),
    ];

    expect(subtasksOf(todos, "a").map((t) => t.id)).toEqual(["b", "z"]);
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

    subtasksOf(todos, "a");

    expect(todos.map((t) => t.id)).toEqual(order);
  });
});

describe("topLevelTodos", () => {
  it("drops subtasks, which is what keeps them off the board", () => {
    const todos = [
      todo({ id: "a" }),
      todo({ id: "b", parent_id: "a" }),
      todo({ id: "c" }),
    ];

    expect(topLevelTodos(todos).map((t) => t.id)).toEqual(["a", "c"]);
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
      subtaskProgress(subtasksOf(todos, "a"), doneColumnIds(COLUMNS)),
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
});
