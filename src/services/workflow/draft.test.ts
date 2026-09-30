import { describe, expect, it } from "vitest";

import type { IColumn, IStatus } from "@/types/data";

import {
  brokenMigrations,
  columnCategoryOf,
  draftOf,
  entryStatusOf,
  renamedWithColumn,
  sameWorkflow,
  statusNameTaken,
  withColumnAdded,
  withColumnDeleted,
  withColumnOrder,
  withColumnRemoved,
  withColumnRenamed,
  withMigrationsRetargeted,
  hasEdge,
  withStatusAdded,
  withStatusUnmapped,
  withTransitionAdded,
  withTransitionRemoved,
  withTransitionRetargeted,
  withTransitionsInto,
  withStatusCategory,
  withStatusDeleted,
  withStatusHidden,
  withStatusMoved,
  withStatusRenamed,
  workItemCount,
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
      transitions: [],
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
        transitions: [],
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

// provisioned(), with a second status in To Do and a hidden one in Done.
function crowded(): WorkflowDraft {
  const draft = provisioned();

  return {
    ...draft,
    statuses: [
      draft.statuses[0]!,
      {
        id: "s-queued",
        column_id: "c-todo",
        name: "Queued",
        category: "todo",
        is_hidden: false,
      },
      draft.statuses[1]!,
      draft.statuses[2]!,
      {
        id: "s-parked",
        column_id: "c-done",
        name: "Parked",
        category: "done",
        is_hidden: true,
      },
    ],
  };
}

const ids = (draft: WorkflowDraft | null) =>
  draft?.statuses.map((it) => `${it.column_id}/${it.id}`);

describe("withStatusMoved", () => {
  it("moves a status into another column at the index given", () => {
    expect(ids(withStatusMoved(crowded(), "s-queued", "c-done", 1))).toEqual([
      "c-todo/s-todo",
      "c-doing/s-doing",
      "c-done/s-done",
      "c-done/s-queued",
      "c-done/s-parked",
    ]);
  });

  it("reorders inside a column, counting the index without the status moved", () => {
    expect(ids(withStatusMoved(crowded(), "s-todo", "c-todo", 1))).toEqual([
      "c-todo/s-queued",
      "c-todo/s-todo",
      "c-doing/s-doing",
      "c-done/s-done",
      "c-done/s-parked",
    ]);
  });

  it("clamps the index and fills an empty column", () => {
    const draft = withColumnAdded(provisioned(), {
      columnId: "c-empty",
      statusId: "s-empty",
      title: "Empty",
      category: "todo",
    });

    draft.statuses = draft.statuses.filter((it) => it.id !== "s-empty");

    expect(ids(withStatusMoved(draft, "s-todo", "c-empty", 9))).toEqual([
      "c-doing/s-doing",
      "c-done/s-done",
      "c-empty/s-todo",
    ]);
  });

  it("keeps the array in board order after the columns were reordered", () => {
    const draft = withColumnOrder(crowded(), ["c-done", "c-todo", "c-doing"]);

    expect(ids(withStatusMoved(draft, "s-doing", "c-todo", 0))).toEqual([
      "c-done/s-done",
      "c-done/s-parked",
      "c-todo/s-doing",
      "c-todo/s-todo",
      "c-todo/s-queued",
    ]);
  });

  it("is null for a status or column that is not in the draft", () => {
    expect(withStatusMoved(crowded(), "s-gone", "c-todo", 0)).toBeNull();
    expect(withStatusMoved(crowded(), "s-todo", "c-gone", 0)).toBeNull();
  });

  it("does not touch the draft it was given", () => {
    const draft = crowded();
    const before = structuredClone(draft);

    withStatusMoved(draft, "s-todo", "c-done", 0);

    expect(draft).toEqual(before);
  });
});

describe("withStatusAdded", () => {
  it("appends a visible status to its column", () => {
    const next = withStatusAdded(crowded(), {
      id: "s-new",
      columnId: "c-todo",
      name: "Triage",
      category: "todo",
    });

    expect(ids(next)?.slice(0, 3)).toEqual([
      "c-todo/s-todo",
      "c-todo/s-queued",
      "c-todo/s-new",
    ]);
    expect(next?.statuses[2]?.is_hidden).toBe(false);
  });

  it("is null for a taken or empty name, or a missing column", () => {
    const add = (name: string, columnId = "c-todo") =>
      withStatusAdded(crowded(), {
        id: "s-new",
        columnId,
        name,
        category: "todo",
      });

    expect(add("queued")).toBeNull();
    expect(add("  ")).toBeNull();
    expect(add("Triage", "c-gone")).toBeNull();
  });
});

describe("withStatusRenamed / Category / Hidden", () => {
  it("changes the one status", () => {
    const draft = crowded();

    expect(
      withStatusRenamed(draft, "s-queued", "Ready")?.statuses[1]?.name,
    ).toBe("Ready");
    expect(
      withStatusCategory(draft, "s-queued", "in_review")?.statuses[1]?.category,
    ).toBe("in_review");
    expect(
      withStatusHidden(draft, "s-queued", true)?.statuses[1]?.is_hidden,
    ).toBe(true);
    expect(draft.statuses[1]).toEqual(crowded().statuses[1]);
  });

  it("refuses a name another status has, but not its own in another case", () => {
    expect(withStatusRenamed(crowded(), "s-queued", "DONE")).toBeNull();
    expect(
      withStatusRenamed(crowded(), "s-queued", "QUEUED")?.statuses[1]?.name,
    ).toBe("QUEUED");
  });

  it("is null for a status that is not in the draft", () => {
    expect(withStatusRenamed(crowded(), "s-gone", "X")).toBeNull();
    expect(withStatusCategory(crowded(), "s-gone", "done")).toBeNull();
    expect(withStatusHidden(crowded(), "s-gone", true)).toBeNull();
  });
});

describe("withStatusDeleted", () => {
  it("deletes a status with no work items without a migration", () => {
    const next = withStatusDeleted(crowded(), "s-queued", null);

    expect(next?.statuses.map((it) => it.id)).not.toContain("s-queued");
    expect(next?.migrations).toEqual([]);
  });

  it("records where the work items go", () => {
    expect(
      withStatusDeleted(crowded(), "s-queued", "s-doing")?.migrations,
    ).toEqual([{ from: "s-queued", to: "s-doing" }]);
  });

  it("sends work already bound for the status on to the same place", () => {
    const first = withStatusDeleted(crowded(), "s-queued", "s-todo")!;

    expect(withStatusDeleted(first, "s-todo", "s-done")?.migrations).toEqual([
      { from: "s-queued", to: "s-done" },
      { from: "s-todo", to: "s-done" },
    ]);
  });

  it("moves only the work bound for a status the draft created", () => {
    const added = withStatusAdded(crowded(), {
      id: "s-new",
      columnId: "c-todo",
      name: "Triage",
      category: "todo",
    })!;
    const bound = withStatusDeleted(added, "s-queued", "s-new")!;
    const next = withStatusDeleted(bound, "s-new", "s-doing", {
      stored: false,
    });

    expect(next?.migrations).toEqual([{ from: "s-queued", to: "s-doing" }]);
    expect(next?.statuses.map((it) => it.id)).not.toContain("s-new");
  });

  it("is null into itself, a hidden status or a missing one", () => {
    expect(withStatusDeleted(crowded(), "s-todo", "s-todo")).toBeNull();
    expect(withStatusDeleted(crowded(), "s-todo", "s-parked")).toBeNull();
    expect(withStatusDeleted(crowded(), "s-todo", "s-gone")).toBeNull();
    expect(withStatusDeleted(crowded(), "s-gone", null)).toBeNull();
  });
});

describe("workItemCount", () => {
  const counts = new Map([
    ["s-todo", 2],
    ["s-queued", 3],
  ]);

  it("is the status's own work items", () => {
    expect(workItemCount(crowded(), "s-todo", counts)).toBe(2);
    expect(workItemCount(crowded(), "s-doing", counts)).toBe(0);
  });

  it("adds the work an earlier delete sends to it", () => {
    const bound = withStatusDeleted(crowded(), "s-queued", "s-todo")!;

    expect(workItemCount(bound, "s-todo", counts)).toBe(5);
    expect(
      workItemCount(
        withStatusDeleted(bound, "s-todo", "s-doing")!,
        "s-doing",
        counts,
      ),
    ).toBe(5);
  });
});

describe("brokenMigrations", () => {
  it("reports work bound for a status deleted or hidden afterwards", () => {
    const bound = withStatusDeleted(crowded(), "s-queued", "s-doing")!;

    expect(brokenMigrations(bound)).toEqual([]);
    expect(
      brokenMigrations(withStatusDeleted(bound, "s-doing", null)!),
    ).toEqual([{ from: "s-queued", to: "s-doing" }]);
    expect(brokenMigrations(withStatusHidden(bound, "s-doing", true)!)).toEqual(
      [{ from: "s-queued", to: "s-doing" }],
    );
  });

  it("is repaired by retargeting, which refuses a hidden target", () => {
    const broken = withStatusDeleted(
      withStatusDeleted(crowded(), "s-queued", "s-doing")!,
      "s-doing",
      null,
    )!;

    expect(withMigrationsRetargeted(broken, "s-doing", "s-parked")).toBeNull();

    const repaired = withMigrationsRetargeted(broken, "s-doing", "s-done")!;

    expect(repaired.migrations).toEqual([{ from: "s-queued", to: "s-done" }]);
    expect(brokenMigrations(repaired)).toEqual([]);
  });
});

describe("withColumnRemoved", () => {
  it("moves the column's statuses to the end of the column before it", () => {
    const next = withColumnRemoved(crowded(), "c-doing");

    expect(next?.columns.map((it) => it.id)).toEqual(["c-todo", "c-done"]);
    expect(ids(next)).toEqual([
      "c-todo/s-todo",
      "c-todo/s-queued",
      "c-todo/s-doing",
      "c-done/s-done",
      "c-done/s-parked",
    ]);
    expect(next?.migrations).toEqual([]);
  });

  it("moves the first column's statuses to the front of the next", () => {
    expect(ids(withColumnRemoved(crowded(), "c-todo"))).toEqual([
      "c-doing/s-todo",
      "c-doing/s-queued",
      "c-doing/s-doing",
      "c-done/s-done",
      "c-done/s-parked",
    ]);
  });

  it("is null for the only column, or one not in the draft", () => {
    const single = withColumnRemoved(
      withColumnRemoved(provisioned(), "c-todo")!,
      "c-doing",
    )!;

    expect(single.columns).toHaveLength(1);
    expect(withColumnRemoved(single, "c-done")).toBeNull();
    expect(withColumnRemoved(provisioned(), "c-gone")).toBeNull();
  });
});

describe("columnCategoryOf", () => {
  it("is the first visible status's, then the first's, then the default", () => {
    const draft = crowded();

    expect(columnCategoryOf(draft, "c-doing")).toBe("in_progress");

    draft.statuses = draft.statuses.map((it) =>
      it.id === "s-done" ? { ...it, category: "in_review" } : it,
    );

    expect(columnCategoryOf(draft, "c-done")).toBe("in_review");
    expect(
      columnCategoryOf(withStatusDeleted(draft, "s-done", null)!, "c-done"),
    ).toBe("done");
    expect(columnCategoryOf(draft, "c-gone")).toBe("todo");
  });
});

describe("sameWorkflow", () => {
  it("is true for an edit that was undone", () => {
    const draft = crowded();
    const moved = withStatusMoved(draft, "s-todo", "c-done", 0)!;

    expect(sameWorkflow(draft, moved)).toBe(false);
    expect(
      sameWorkflow(draft, withStatusMoved(moved, "s-todo", "c-todo", 0)!),
    ).toBe(true);
  });

  it("ignores array order across columns, but not inside one", () => {
    const draft = crowded();
    const shuffled = { ...draft, statuses: [...draft.statuses].reverse() };

    expect(sameWorkflow(draft, shuffled)).toBe(false);
    expect(
      sameWorkflow(draft, {
        ...draft,
        statuses: [
          draft.statuses[3]!,
          draft.statuses[4]!,
          ...draft.statuses.slice(0, 3),
        ],
      }),
    ).toBe(true);
  });

  it("sees a new migration", () => {
    const draft = crowded();

    expect(
      sameWorkflow(draft, withStatusDeleted(draft, "s-queued", "s-todo")!),
    ).toBe(false);
  });
});

const withEdges = (edges: [string, string][]): WorkflowDraft => ({
  ...provisioned(),
  transitions: edges.map(([from, to]) => ({ from, to })),
});

describe("transitions", () => {
  it("adds and removes exactly the edge named", () => {
    let draft = provisioned();

    draft = withTransitionAdded(draft, "s-todo", "s-doing")!;
    draft = withTransitionAdded(draft, "s-doing", "s-done")!;
    draft = withTransitionAdded(draft, "s-todo", "s-done")!;
    draft = withTransitionRemoved(draft, "s-doing", "s-done")!;

    expect(draft.transitions).toEqual([
      { from: "s-todo", to: "s-doing" },
      { from: "s-todo", to: "s-done" },
    ]);
  });

  it("refuses a self edge, a duplicate, an unknown status and removing what is not there", () => {
    const draft = withEdges([["s-todo", "s-doing"]]);

    expect(withTransitionAdded(draft, "s-todo", "s-todo")).toBeNull();
    expect(withTransitionAdded(draft, "s-todo", "s-doing")).toBeNull();
    expect(withTransitionAdded(draft, "s-todo", "nope")).toBeNull();
    expect(withTransitionRemoved(draft, "s-doing", "s-todo")).toBeNull();
  });

  it("gives a new status the sequential edges, so it is reachable", () => {
    const draft = withEdges([]);
    const next = withStatusAdded(draft, {
      id: "s-review",
      columnId: "c-doing",
      name: "Review",
      category: "in_review",
    })!;

    expect(hasEdge(next, "s-doing", "s-review")).toBe(true);
    expect(hasEdge(next, "s-review", "s-done")).toBe(true);
    expect(hasEdge(next, "s-review", "s-todo")).toBe(true);
    expect(hasEdge(next, "s-todo", "s-review")).toBe(false);
  });

  it("bridges the edges of a deleted status so work is not stranded", () => {
    const draft = withEdges([
      ["s-todo", "s-doing"],
      ["s-doing", "s-done"],
    ]);
    const next = withStatusDeleted(draft, "s-doing", "s-todo")!;

    expect(next.transitions).toEqual([{ from: "s-todo", to: "s-done" }]);
  });

  it("counts an edge change as a workflow change", () => {
    const draft = withEdges([["s-todo", "s-doing"]]);

    expect(sameWorkflow(draft, withTransitionAdded(draft, "s-doing", "s-done")!)).toBe(
      false,
    );
  });

  it("moves either end of a transition in one edit", () => {
    const draft = withEdges([["s-todo", "s-doing"]]);
    const next = withTransitionRetargeted(
      draft,
      { from: "s-todo", to: "s-doing" },
      { from: "s-todo", to: "s-done" },
    )!;

    expect(next.transitions).toEqual([{ from: "s-todo", to: "s-done" }]);
  });

  it("refuses to retarget onto itself, onto an existing edge or from a missing one", () => {
    const draft = withEdges([
      ["s-todo", "s-doing"],
      ["s-doing", "s-todo"],
    ]);
    const edge = { from: "s-todo", to: "s-doing" };

    expect(withTransitionRetargeted(draft, edge, edge)).toBeNull();
    expect(
      withTransitionRetargeted(draft, edge, { from: "s-doing", to: "s-todo" }),
    ).toBeNull();
    expect(
      withTransitionRetargeted(draft, edge, { from: "s-todo", to: "s-todo" }),
    ).toBeNull();
    expect(
      withTransitionRetargeted(
        draft,
        { from: "s-done", to: "s-todo" },
        { from: "s-done", to: "s-doing" },
      ),
    ).toBeNull();
  });

  it("lets every other status move into one, adding only the missing edges", () => {
    const draft = withEdges([["s-todo", "s-done"]]);
    const next = withTransitionsInto(draft, "s-done")!;

    expect(next.transitions).toEqual([
      { from: "s-todo", to: "s-done" },
      { from: "s-doing", to: "s-done" },
    ]);
    expect(withTransitionsInto(next, "s-done")).toBeNull();
    expect(withTransitionsInto(next, "nope")).toBeNull();
  });
});

describe("unmapped statuses", () => {
  it("unmaps a status and maps it back into a column", () => {
    const unmapped = withStatusUnmapped(provisioned(), "s-doing")!;

    expect(unmapped.statuses.find((it) => it.id === "s-doing")!.column_id).toBeNull();
    expect(unmapped.statuses.at(-1)!.id).toBe("s-doing");

    const back = withStatusMoved(unmapped, "s-doing", "c-todo", 0)!;

    expect(back.statuses.find((it) => it.id === "s-doing")!.column_id).toBe("c-todo");
  });

  it("adds a status straight into the unmapped lane", () => {
    const next = withStatusAdded(provisioned(), {
      id: "s-blocked",
      columnId: null,
      name: "Blocked",
      category: "in_progress",
    })!;

    expect(next.statuses.find((it) => it.id === "s-blocked")!.column_id).toBeNull();
  });
});
