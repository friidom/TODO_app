import { describe, expect, it } from "vitest";

import {
  withStatusAdded,
  withStatusCategory,
  withStatusDeleted,
  withStatusHidden,
  withStatusRenamed,
  withStatusUnmapped,
  withTransitionAdded,
  withTransitionRemoved,
  type WorkflowDraft,
} from "./draft";
import { draftChanges, workflowWarnings } from "./draftChanges";

const BASE: WorkflowDraft = {
  version: 3,
  columns: [
    { id: "col-todo", title: "To Do" },
    { id: "col-done", title: "Done" },
  ],
  statuses: [
    {
      id: "open",
      column_id: "col-todo",
      name: "Open",
      category: "todo",
      is_hidden: false,
    },
    {
      id: "doing",
      column_id: "col-todo",
      name: "Doing",
      category: "in_progress",
      is_hidden: false,
    },
    {
      id: "done",
      column_id: "col-done",
      name: "Done",
      category: "done",
      is_hidden: false,
    },
  ],
  transitions: [
    { from: "open", to: "doing" },
    { from: "doing", to: "done" },
    { from: "done", to: "open" },
  ],
  migrations: [],
};

const NO_COUNTS = new Map<string, number>();

describe("draftChanges", () => {
  it("reports nothing for an untouched draft", () => {
    expect(draftChanges(BASE, BASE, NO_COUNTS)).toEqual([]);
  });

  it("names each status edit", () => {
    let draft = withStatusRenamed(BASE, "open", "Backlog")!;

    draft = withStatusCategory(draft, "doing", "in_review")!;
    draft = withStatusHidden(draft, "done", true)!;
    draft = withStatusUnmapped(draft, "doing")!;

    const changes = draftChanges(BASE, draft, NO_COUNTS);

    expect(changes).toHaveLength(4);
    expect(changes).toEqual(
      expect.arrayContaining([
        { kind: "status-renamed", from: "Open", to: "Backlog" },
        {
          kind: "status-category",
          name: "Doing",
          from: "in_progress",
          to: "in_review",
        },
        { kind: "status-column", name: "Doing", from: "To Do", to: null },
        { kind: "status-visibility", name: "Done", hidden: true },
      ]),
    );
  });

  it("names added and removed transitions between surviving statuses", () => {
    let draft = withTransitionRemoved(BASE, "done", "open")!;

    draft = withTransitionAdded(draft, "open", "done")!;

    expect(draftChanges(BASE, draft, NO_COUNTS)).toEqual([
      { kind: "transition-added", from: "Open", to: "Done" },
      { kind: "transition-removed", from: "Done", to: "Open" },
    ]);
  });

  it("folds a new status's transitions into its own line", () => {
    const draft = withStatusAdded(BASE, {
      id: "qa",
      columnId: null,
      name: "QA",
      category: "in_review",
    })!;
    const changes = draftChanges(BASE, draft, NO_COUNTS);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "status-added", name: "QA" });
    expect(
      changes[0]!.kind === "status-added" && changes[0]!.transitions,
    ).toBeGreaterThan(0);
  });

  it("says where a deleted status's work goes, and lists only the bridges it adds", () => {
    const draft = withStatusDeleted(BASE, "doing", "open")!;
    const changes = draftChanges(BASE, draft, new Map([["doing", 4]]));

    expect(changes).toContainEqual({
      kind: "status-deleted",
      name: "Doing",
      workItems: 4,
      movedTo: "Open",
    });
    expect(changes).toContainEqual({
      kind: "transition-added",
      from: "Open",
      to: "Done",
    });
    expect(
      changes.filter((change) => change.kind === "transition-removed"),
    ).toEqual([]);
  });
});

describe("workflowWarnings", () => {
  it("is quiet for a workflow every status can enter and leave", () => {
    expect(workflowWarnings(BASE)).toEqual([]);
  });

  it("flags a status work cannot leave, unless it is done", () => {
    const draft = withTransitionRemoved(BASE, "doing", "done")!;
    const alsoDone = withTransitionRemoved(draft, "done", "open")!;

    expect(workflowWarnings(alsoDone)).toContainEqual({
      kind: "no-way-out",
      statusId: "doing",
    });
    expect(
      workflowWarnings(alsoDone).some(
        (warning) =>
          warning.kind === "no-way-out" && warning.statusId === "done",
      ),
    ).toBe(false);
  });

  it("flags a status nothing leads to unless work can be created in it", () => {
    const draft = withTransitionRemoved(BASE, "open", "doing")!;

    expect(workflowWarnings(draft)).toContainEqual({
      kind: "no-way-in",
      statusId: "doing",
    });

    const firstInColumn = withTransitionRemoved(BASE, "done", "open")!;

    expect(workflowWarnings(firstInColumn)).toEqual([]);
  });

  it("says nothing about an unmapped status, which takes no work", () => {
    const draft = withStatusUnmapped(
      withTransitionRemoved(BASE, "open", "doing")!,
      "doing",
    )!;

    expect(
      workflowWarnings(draft).filter((warning) => warning.statusId === "doing"),
    ).toEqual([]);
  });
});
