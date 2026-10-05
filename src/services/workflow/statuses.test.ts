import { describe, expect, it } from "vitest";

import type { IColumn, IStatus, Todo } from "@/types/data";

import {
  categoryOfTodo,
  columnCategory,
  columnIdOf,
  defaultStatus,
  doneStatusIds,
  dropChoices,
  entryStatus,
  firstTodoStatus,
  hasTransition,
  isDoneIn,
  reachableStatusIds,
  selectableStatuses,
  statusesInColumn,
  subtaskStartStatus,
  toWorkflowModel,
  unmappedStatuses,
  visibleCategories,
} from "./statuses";

const column = (id: string, rank: number | null, position = 0): IColumn =>
  ({ id, board_id: "b-1", title: id, rank, position }) as IColumn;

const status = (
  id: string,
  columnId: string,
  fields: Partial<IStatus> = {},
): IStatus =>
  ({
    id,
    board_id: "b-1",
    column_id: columnId,
    name: id,
    category: "todo",
    rank: 1024,
    is_hidden: false,
    ...fields,
  }) as IStatus;

const card = (status_id: string | null): Pick<Todo, "status_id"> => ({
  status_id,
});

// Two columns: To Do holds "open" and a hidden "parked"; Doing holds "doing"
// and "blocked". Handed over out of order on purpose.
const MODEL = toWorkflowModel({
  workflow_version: 7,
  transitions: [],
  columns: [column("col-doing", 2048), column("col-todo", 1024)],
  statuses: [
    status("blocked", "col-doing", { category: "in_progress", rank: 2048 }),
    status("parked", "col-todo", { is_hidden: true, rank: 512 }),
    status("doing", "col-doing", { category: "in_progress", rank: 1024 }),
    status("open", "col-todo", { rank: 1024 }),
  ],
});

describe("toWorkflowModel", () => {
  it("orders columns by rank and statuses by column, then rank", () => {
    expect(MODEL.version).toBe(7);
    expect(MODEL.columns.map((it) => it.id)).toEqual(["col-todo", "col-doing"]);
    expect(MODEL.statuses.map((it) => it.id)).toEqual([
      "parked",
      "open",
      "doing",
      "blocked",
    ]);
  });

  it("indexes every status by id", () => {
    expect(MODEL.statusById.get("blocked")?.column_id).toBe("col-doing");
    expect(MODEL.statusById.size).toBe(4);
  });

  it("falls back to position for a column with no rank, as byRank does", () => {
    const model = toWorkflowModel({
      workflow_version: 1,
      transitions: [],
      columns: [column("second", null, 1), column("first", null, 0)],
      statuses: [status("b", "second"), status("a", "first")],
    });

    expect(model.statuses.map((it) => it.id)).toEqual(["a", "b"]);
  });
});

describe("a card's column and category come from its status", () => {
  it("reads the column through the status", () => {
    expect(columnIdOf(card("blocked"), MODEL.statusById)).toBe("col-doing");
  });

  it("is null for a backlog card, and for a status the board does not know", () => {
    expect(columnIdOf(card(null), MODEL.statusById)).toBeNull();
    expect(columnIdOf(card("gone"), MODEL.statusById)).toBeNull();
    expect(categoryOfTodo(card(null), MODEL.statusById)).toBeNull();
  });

  it("reads the category through the status", () => {
    expect(categoryOfTodo(card("doing"), MODEL.statusById)).toBe("in_progress");
  });

  it("counts done by status category", () => {
    const done = doneStatusIds([
      ...MODEL.statuses,
      status("shipped", "col-doing", { category: "done" }),
    ]);

    expect([...done]).toEqual(["shipped"]);
    expect(isDoneIn(card("shipped"), done)).toBe(true);
    expect(isDoneIn(card(null), done)).toBe(false);
  });
});

describe("statusesInColumn", () => {
  it("lists a column's statuses by rank, hidden ones included", () => {
    expect(
      statusesInColumn(MODEL.statuses, "col-todo").map((it) => it.id),
    ).toEqual(["parked", "open"]);
  });
});

describe("columnCategory", () => {
  it("is the category of the column's first visible status", () => {
    const statuses = [
      status("a", "col-x", { category: "done", is_hidden: true, rank: 1 }),
      status("b", "col-x", { category: "in_review", rank: 2 }),
    ];

    expect(columnCategory(statuses, "col-x")).toBe("in_review");
  });

  it("falls back to a hidden status, then to todo", () => {
    expect(
      columnCategory(
        [status("a", "col-x", { category: "done", is_hidden: true })],
        "col-x",
      ),
    ).toBe("done");
    expect(columnCategory([], "col-x")).toBe("todo");
  });
});

describe("entryStatus", () => {
  it("is the column's first visible status, never a hidden one", () => {
    expect(entryStatus(MODEL.statuses, "col-todo")?.id).toBe("open");
  });

  it("takes the first status the workflow accepts", () => {
    const accepts = (it: IStatus) => it.id !== "doing";

    expect(entryStatus(MODEL.statuses, "col-doing", accepts)?.id).toBe(
      "blocked",
    );
  });

  it("falls back to the first visible one when none is accepted, so the gate can say why", () => {
    expect(entryStatus(MODEL.statuses, "col-doing", () => false)?.id).toBe(
      "doing",
    );
  });

  it("is null for a column with no visible status", () => {
    const statuses = [status("a", "col-x", { is_hidden: true })];

    expect(entryStatus(statuses, "col-x")).toBeNull();
    expect(entryStatus(statuses, "col-empty")).toBeNull();
  });
});

describe("dropChoices", () => {
  it("offers every visible status of a column in order, flagged by the gate", () => {
    const accepts = (it: IStatus) => it.id !== "blocked";

    expect(dropChoices(MODEL.statuses, "col-doing", accepts)).toEqual([
      { status: MODEL.statusById.get("doing"), allowed: true },
      { status: MODEL.statusById.get("blocked"), allowed: false },
    ]);
  });

  it("is null when a hidden status leaves only one place to land", () => {
    expect(dropChoices(MODEL.statuses, "col-todo", () => true)).toBeNull();
  });

  it("still names a lone status the gate refuses", () => {
    expect(dropChoices(MODEL.statuses, "col-todo", () => false)).toEqual([
      { status: MODEL.statusById.get("open"), allowed: false },
    ]);
  });
});

describe("selectableStatuses", () => {
  it("offers visible statuses only", () => {
    expect(
      selectableStatuses(MODEL.statuses, "open").map((it) => it.id),
    ).toEqual(["open", "doing", "blocked"]);
  });

  it("keeps a hidden status the card is already in", () => {
    expect(
      selectableStatuses(MODEL.statuses, "parked").map((it) => it.id),
    ).toContain("parked");
  });
});

describe("visibleCategories", () => {
  it("counts only stages a card can be put in", () => {
    const statuses = [
      status("a", "col-x", { category: "todo" }),
      status("b", "col-x", { category: "in_review", is_hidden: true }),
    ];

    expect([...visibleCategories(statuses)]).toEqual(["todo"]);
  });
});

// Mirrors the backend's sprints.repo#firstTodoStatus.
describe("firstTodoStatus", () => {
  it("picks the first visible todo status in board order", () => {
    expect(firstTodoStatus(MODEL.statuses)?.id).toBe("open");
  });

  it("skips a todo status in a later column for an earlier one", () => {
    const model = toWorkflowModel({
      workflow_version: 1,
      transitions: [],
      columns: [column("late", 3), column("early", 2), column("review", 1)],
      statuses: [
        status("todo-2", "late"),
        status("todo-1", "early"),
        status("in-review", "review", { category: "in_progress" }),
      ],
    });

    expect(firstTodoStatus(model.statuses)?.id).toBe("todo-1");
  });

  it("is null when no visible todo status exists", () => {
    expect(
      firstTodoStatus([status("done-1", "col-x", { category: "done" })]),
    ).toBeNull();
    expect(
      firstTodoStatus([status("a", "col-x", { is_hidden: true })]),
    ).toBeNull();
  });
});

describe("subtaskStartStatus", () => {
  it("inherits the parent's status", () => {
    expect(subtaskStartStatus(MODEL.statuses, "doing")?.id).toBe("doing");
  });

  it("takes the first visible status of the parent's column when the parent's is hidden", () => {
    expect(subtaskStartStatus(MODEL.statuses, "parked")?.id).toBe("open");
  });

  it("gives a backlog parent's subtask the status starting a sprint gives the parent", () => {
    expect(subtaskStartStatus(MODEL.statuses, null)?.id).toBe("open");
  });

  it("falls back to the first todo status when the parent's column has nothing visible", () => {
    const statuses = [
      status("open", "col-todo"),
      status("retired", "col-old", { category: "done", is_hidden: true }),
    ];

    expect(subtaskStartStatus(statuses, "retired")?.id).toBe("open");
  });

  it("is null only when the board has nowhere to put it", () => {
    expect(subtaskStartStatus([], null)).toBeNull();
  });
});

describe("defaultStatus", () => {
  it("is the first visible status in board order, whatever its category", () => {
    expect(defaultStatus(MODEL.statuses)?.id).toBe("open");
    expect(
      defaultStatus([status("a", "col-x", { category: "done" })])?.id,
    ).toBe("a");
    expect(defaultStatus([])).toBeNull();
  });
});

describe("unmapped statuses", () => {
  const model = toWorkflowModel({
    workflow_version: 1,
    transitions: [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
    ],
    columns: [column("col", 1024)],
    statuses: [
      status("a", "col"),
      status("b", "col"),
      status("c", null as unknown as string, { column_id: null }),
    ],
  });

  it("sorts an unmapped status after every column and lists it apart", () => {
    expect(model.statuses.map((it) => it.id)).toEqual(["a", "b", "c"]);
    expect(unmappedStatuses(model.statuses).map((it) => it.id)).toEqual(["c"]);
  });

  it("never offers an unmapped status for placement", () => {
    expect(selectableStatuses(model.statuses, "a").map((it) => it.id)).toEqual([
      "a",
      "b",
    ]);
    expect(defaultStatus(model.statuses)?.id).toBe("a");
  });

  it("reads reachability off the stored edges, in one direction", () => {
    expect(hasTransition(model.transitions, "a", "b")).toBe(true);
    expect(hasTransition(model.transitions, "b", "a")).toBe(false);
    expect([...reachableStatusIds(model.transitions, "a")].sort()).toEqual([
      "b",
      "c",
    ]);
  });
});
