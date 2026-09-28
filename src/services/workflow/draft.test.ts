import { describe, expect, it } from "vitest";

import type { IColumn, IStatus } from "@/types/data";

import {
  draftOf,
  entryStatusOf,
  renamedWithColumn,
  statusNameTaken,
  withColumnAdded,
  withColumnDeleted,
  withColumnOrder,
  withColumnRenamed,
  type WorkflowDraft,
} from "./draft";
import { toWorkflowModel } from "./statuses";

const column = (id: string, title: string | null, rank: number): IColumn =>
  ({ id, board_id: "b-1", title, rank, position: null }) as IColumn;

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

// The board every account starts with, one status per column, named after it.
function provisioned(): WorkflowDraft {
  return draftOf(
    toWorkflowModel({
      workflow_version: 3,
      columns: [
        column("c-done", "Done", 3072),
        column("c-todo", "To Do", 1024),
        column("c-doing", "In Progress", 2048),
      ],
      statuses: [
        status("s-done", "c-done", { name: "Done", category: "done" }),
        status("s-todo", "c-todo", { name: "To Do" }),
        status("s-doing", "c-doing", {
          name: "In Progress",
          category: "in_progress",
        }),
      ],
    }),
  );
}

describe("draftOf", () => {
  it("is the workflow as it is, in board order, at its version", () => {
    const draft = provisioned();

    expect(draft.version).toBe(3);
    expect(draft.columns.map((it) => it.id)).toEqual([
      "c-todo",
      "c-doing",
      "c-done",
    ]);
    expect(draft.statuses.map((it) => it.id)).toEqual([
      "s-todo",
      "s-doing",
      "s-done",
    ]);
    expect(draft.migrations).toEqual([]);
  });

  it("names an untitled column, since the API requires a title", () => {
    const draft = draftOf(
      toWorkflowModel({
        workflow_version: 1,
        columns: [column("c", null, 1)],
        statuses: [],
      }),
    );

    expect(draft.columns[0]!.title).toBe("Untitled");
  });
});

describe("statusNameTaken", () => {
  it("compares names without case or surrounding space", () => {
    expect(statusNameTaken(provisioned(), " to do ")).toBe(true);
    expect(statusNameTaken(provisioned(), "Blocked")).toBe(false);
  });

  it("ignores the status being renamed", () => {
    expect(statusNameTaken(provisioned(), "to do", "s-todo")).toBe(false);
  });
});

describe("withColumnAdded", () => {
  it("appends the column with one visible status of its name and category", () => {
    const next = withColumnAdded(provisioned(), {
      columnId: "c-new",
      statusId: "s-new",
      title: "Blocked",
      category: "in_progress",
    });

    expect(next.columns.at(-1)).toEqual({ id: "c-new", title: "Blocked" });
    expect(next.statuses.at(-1)).toEqual({
      id: "s-new",
      column_id: "c-new",
      name: "Blocked",
      category: "in_progress",
      is_hidden: false,
    });
  });
});

describe("withColumnRenamed", () => {
  it("renames a one-status column's status with it, as renaming a column always did", () => {
    const next = withColumnRenamed(provisioned(), "c-todo", "Backlog");

    expect(next.columns.find((it) => it.id === "c-todo")?.title).toBe(
      "Backlog",
    );
    expect(next.statuses.find((it) => it.id === "s-todo")?.name).toBe(
      "Backlog",
    );
  });

  it("leaves a status alone when it is named differently from its column", () => {
    const draft = provisioned();

    draft.statuses[0] = { ...draft.statuses[0]!, name: "Open" };

    expect(renamedWithColumn(draft, "c-todo")).toBeNull();
    expect(
      withColumnRenamed(draft, "c-todo", "Backlog").statuses.find(
        (it) => it.id === "s-todo",
      )?.name,
    ).toBe("Open");
  });

  it("leaves the statuses alone in a column that shows several", () => {
    const draft = provisioned();

    draft.statuses.push({
      id: "s-queued",
      column_id: "c-todo",
      name: "Queued",
      category: "todo",
      is_hidden: false,
    });

    expect(renamedWithColumn(draft, "c-todo")).toBeNull();
  });
});

describe("withColumnOrder", () => {
  it("puts the columns in the order given", () => {
    const next = withColumnOrder(provisioned(), [
      "c-done",
      "c-todo",
      "c-doing",
    ]);

    expect(next.columns.map((it) => it.id)).toEqual([
      "c-done",
      "c-todo",
      "c-doing",
    ]);
  });

  it("keeps a column the order does not name after the ones it does", () => {
    const draft = provisioned();

    draft.columns.splice(1, 0, { id: "c-theirs", title: "Theirs" });

    expect(
      withColumnOrder(draft, ["c-done", "c-doing", "c-todo"]).columns.map(
        (it) => it.id,
      ),
    ).toEqual(["c-done", "c-doing", "c-todo", "c-theirs"]);
  });

  it("leaves the statuses where they are", () => {
    expect(withColumnOrder(provisioned(), ["c-done"]).statuses).toEqual(
      provisioned().statuses,
    );
  });
});

describe("withColumnDeleted", () => {
  it("drops the column and its statuses, moving their cards to the destination's entry status", () => {
    const next = withColumnDeleted(provisioned(), "c-todo", "c-done");

    expect(next?.columns.map((it) => it.id)).toEqual(["c-doing", "c-done"]);
    expect(next?.statuses.map((it) => it.id)).toEqual(["s-doing", "s-done"]);
    expect(next?.migrations).toEqual([{ from: "s-todo", to: "s-done" }]);
  });

  it("migrates every status the column held, hidden ones too", () => {
    const draft = provisioned();

    draft.statuses.push({
      id: "s-parked",
      column_id: "c-todo",
      name: "Parked",
      category: "todo",
      is_hidden: true,
    });

    expect(withColumnDeleted(draft, "c-todo", "c-doing")?.migrations).toEqual([
      { from: "s-todo", to: "s-doing" },
      { from: "s-parked", to: "s-doing" },
    ]);
  });

  it("is null into a column with no visible status, or into itself", () => {
    const draft = provisioned();

    draft.statuses = draft.statuses.map((it) =>
      it.column_id === "c-done" ? { ...it, is_hidden: true } : it,
    );

    expect(entryStatusOf(draft, "c-done")).toBeNull();
    expect(withColumnDeleted(draft, "c-todo", "c-done")).toBeNull();
    expect(withColumnDeleted(provisioned(), "c-todo", "c-todo")).toBeNull();
  });
});
