import { describe, expect, it } from "vitest";

import { toWorkflowModel } from "@/services/workflow/statuses";
import type { IColumn, IStatus, Todo } from "@/types/data";
import { rankForDrop } from "@/utils/rank";
import { rowDropIndex, rowLabel, rowReorderContainer } from "./listReorder";

const column = (id: string, position: number): IColumn =>
  ({ id, title: id, position, rank: null }) as IColumn;

const status = (id: string, columnId: string, rank = 1024): IStatus =>
  ({
    id,
    name: id,
    column_id: columnId,
    category: "todo",
    rank,
    is_hidden: false,
  }) as IStatus;

const { statusById } = toWorkflowModel({
  workflow_version: 1,
  transitions: [],
  columns: [column("col-todo", 0), column("col-doing", 1)],
  statuses: [
    status("todo", "col-todo"),
    status("queued", "col-todo", 2048),
    status("doing", "col-doing"),
  ],
});

const card = (id: string, fields: Partial<Todo> = {}): Todo =>
  ({
    id,
    title: `card ${id}`,
    type: "Task",
    status_id: "todo",
    parent_id: null,
    board_key: null,
    position: 0,
    rank: 1024,
    ...fields,
  }) as Todo;

describe("rowReorderContainer", () => {
  it("is the card's board column, because that is the space its rank orders", () => {
    expect(rowReorderContainer(card("a"), "none", statusById)).toBe("col-todo");
    expect(
      rowReorderContainer(
        card("b", { status_id: "queued" }),
        "none",
        statusById,
      ),
    ).toBe("col-todo");
  });

  it("narrows to the status when the List is grouped by status", () => {
    expect(
      rowReorderContainer(
        card("b", { status_id: "queued" }),
        "status",
        statusById,
      ),
    ).toBe("queued");
  });

  it("offers nothing for a backlog card or a status the board does not know", () => {
    expect(
      rowReorderContainer(card("a", { status_id: null }), "none", statusById),
    ).toBeNull();
    expect(
      rowReorderContainer(card("a", { status_id: "gone" }), "none", statusById),
    ).toBeNull();
  });
});

describe("rowDropIndex", () => {
  const a = card("a", { rank: 1000 });
  const hidden = card("hidden", { rank: 1500 });
  const b = card("b", { rank: 2000, status_id: "queued" });
  const c = card("c", { rank: 3000 });
  const tail = card("tail", { rank: 4000 });
  const elsewhere = card("elsewhere", { rank: 1200, status_id: "doing" });

  // array order is not rank order, which is the order the index counts in
  const todos = [c, tail, elsewhere, b, a, hidden];

  it("counts over the whole column, so a row a filter hides still takes its place", () => {
    const index = rowDropIndex(todos, c, "b", "before", statusById);

    expect(index).toBe(2);

    // what useTodoDrop indexes into: the column without the moving card
    const neighbours = [tail, b, a, hidden];

    // between the hidden card and b — directly above b, as drawn
    expect(rankForDrop(neighbours, index)).toBe(1750);
  });

  it("drops after the last row directly beneath it, ahead of hidden cards further down", () => {
    const index = rowDropIndex(todos, a, "c", "after", statusById);

    // [hidden, b, c, tail] without a: straight after c
    expect(index).toBe(3);
  });

  it("ignores other columns and genuine subtasks", () => {
    const parent = card("parent", { rank: 500 });
    const child = card("child", { rank: 600, parent_id: "parent" });

    const index = rowDropIndex(
      [...todos, parent, child],
      c,
      "a",
      "before",
      statusById,
    );

    // [parent, a, hidden, b, tail]: the subtask is not a neighbour
    expect(index).toBe(1);
  });
});

describe("rowLabel", () => {
  it("names a row by its key, falling back to the title while the key is pending", () => {
    expect(rowLabel(card("a", { board_key: 12 }), "KAN")).toBe("KAN-12");
    expect(rowLabel(card("a"), "KAN")).toBe("card a");
  });
});
