import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors.js";
import { RANK_GAP } from "../../lib/rank.js";
import { planWorkflow, type CurrentWorkflow } from "./workflow.plan.js";
import type { PublishWorkflowInput } from "./workflow.schema.js";

const C1 = "00000000-0000-4000-8000-0000000000c1";
const C2 = "00000000-0000-4000-8000-0000000000c2";
const C3 = "00000000-0000-4000-8000-0000000000c3";
const S1 = "00000000-0000-4000-8000-0000000000a1";
const S2 = "00000000-0000-4000-8000-0000000000a2";
const S3 = "00000000-0000-4000-8000-0000000000a3";
const S4 = "00000000-0000-4000-8000-0000000000a4";

function current(cards: Record<string, number> = {}): CurrentWorkflow {
  return {
    columns: [
      { id: C1, title: "To Do", rank: RANK_GAP, position: 0 },
      { id: C2, title: "Done", rank: 2 * RANK_GAP, position: 1 },
    ],
    statuses: [
      { id: S1, column_id: C1, name: "To Do", category: "todo", rank: RANK_GAP, is_hidden: false },
      { id: S2, column_id: C2, name: "Done", category: "done", rank: RANK_GAP, is_hidden: false },
    ],
    transitions: [{ from: S1, to: S2 }],
    cards: new Map(Object.entries(cards)),
  };
}

function unchanged(): PublishWorkflowInput {
  return {
    version: 1,
    columns: [
      { id: C1, title: "To Do" },
      { id: C2, title: "Done" },
    ],
    statuses: [
      { id: S1, column_id: C1, name: "To Do", category: "todo", is_hidden: false },
      { id: S2, column_id: C2, name: "Done", category: "done", is_hidden: false },
    ],
    transitions: [{ from: S1, to: S2 }],
    migrations: [],
  };
}

function refusal(run: () => unknown): { code: string; message: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, message: error.message };

    throw error;
  }

  throw new Error("expected a refusal");
}

describe("planWorkflow", () => {
  it("plans nothing for the workflow as it already is", () => {
    expect(planWorkflow(current(), unchanged())).toEqual({
      createTransitions: [],
      deleteTransitions: [],
      createColumns: [],
      updateColumns: [],
      deleteColumns: [],
      createStatuses: [],
      updateStatuses: [],
      deleteStatuses: [],
      migrations: [],
    });
  });

  it("writes only the fields that changed", () => {
    const input = unchanged();

    input.columns[0] = { id: C1, title: "Open" };
    input.statuses[1] = { ...input.statuses[1]!, is_hidden: true };

    const plan = planWorkflow(current(), input);

    expect(plan.updateColumns).toEqual([{ id: C1, title: "Open" }]);
    expect(plan.updateStatuses).toEqual([{ id: S2, is_hidden: true }]);
  });

  it("treats a case-only rename as a rename", () => {
    const input = unchanged();

    input.statuses[0] = { ...input.statuses[0]!, name: "TO DO" };

    expect(planWorkflow(current(), input).updateStatuses).toEqual([{ id: S1, name: "TO DO" }]);
  });

  it("ranks columns by array order and statuses by order inside their column", () => {
    const input = unchanged();

    input.columns = [
      { id: C2, title: "Done" },
      { id: C3, title: "New" },
      { id: C1, title: "To Do" },
    ];
    input.statuses = [
      { id: S3, column_id: C1, name: "Queued", category: "todo", is_hidden: false },
      { id: S1, column_id: C1, name: "To Do", category: "todo", is_hidden: false },
      { id: S2, column_id: C2, name: "Done", category: "done", is_hidden: false },
    ];

    const plan = planWorkflow(current(), input);

    expect(plan.createColumns).toEqual([{ id: C3, title: "New", rank: 2 * RANK_GAP, position: 1 }]);
    expect(plan.updateColumns).toEqual([
      { id: C2, rank: RANK_GAP, position: 0 },
      { id: C1, rank: 3 * RANK_GAP, position: 2 },
    ]);
    expect(plan.createStatuses).toEqual([
      { id: S3, column_id: C1, name: "Queued", category: "todo", rank: RANK_GAP, is_hidden: false },
    ]);
    expect(plan.updateStatuses).toEqual([{ id: S1, rank: 2 * RANK_GAP }]);
  });

  it("moves a status to another column without moving its cards' order", () => {
    const input = unchanged();

    input.columns.push({ id: C3, title: "Blocked" });
    input.statuses[0] = { ...input.statuses[0]!, column_id: C3 };

    const plan = planWorkflow(current({ [S1]: 4 }), input);

    expect(plan.updateStatuses).toEqual([{ id: S1, column_id: C3 }]);
    expect(plan.migrations).toEqual([]);
    expect(plan.deleteColumns).toEqual([]);
  });

  it("deletes what the publish leaves out", () => {
    const input = unchanged();

    input.columns = [{ id: C2, title: "Done" }];
    input.statuses = [input.statuses[1]!];
    input.transitions = [];

    const plan = planWorkflow(current(), input);

    expect(plan.deleteColumns).toEqual([C1]);
    expect(plan.deleteStatuses).toEqual([S1]);
  });

  it("refuses to delete a status that holds work without saying where it goes", () => {
    const input = unchanged();

    input.statuses = [input.statuses[1]!];
    input.transitions = [];

    expect(refusal(() => planWorkflow(current({ [S1]: 2 }), input))).toEqual({
      code: "conflict",
      message: expect.stringContaining("still holds 2 work items") as unknown as string,
    });
  });

  it("appends migrated cards when they change column, and keeps them in place when they do not", () => {
    const input = unchanged();

    input.statuses = [
      { id: S4, column_id: C1, name: "Open", category: "todo", is_hidden: false },
      input.statuses[1]!,
    ];
    input.transitions = [{ from: S4, to: S2 }];
    input.migrations = [{ from: S1, to: S4 }];

    expect(planWorkflow(current({ [S1]: 1 }), input).migrations).toEqual([
      { from: S1, to: S4, appendTo: null },
    ]);

    input.migrations = [{ from: S1, to: S2 }];

    expect(planWorkflow(current({ [S1]: 1 }), input).migrations).toEqual([
      { from: S1, to: S2, appendTo: C2 },
    ]);
  });

  it("refuses a migration into a hidden status", () => {
    const input = unchanged();

    input.statuses = [{ ...input.statuses[1]!, is_hidden: true }];
    input.transitions = [];
    input.migrations = [{ from: S1, to: S2 }];

    expect(refusal(() => planWorkflow(current({ [S1]: 1 }), input)).code).toBe("bad_request");
  });

  it("refuses a migration off a status the publish keeps, or into one it deletes", () => {
    const keeps = unchanged();

    keeps.migrations = [{ from: S1, to: S2 }];

    expect(refusal(() => planWorkflow(current(), keeps)).code).toBe("bad_request");

    const deletes = unchanged();

    deletes.statuses = [deletes.statuses[0]!];
    deletes.migrations = [{ from: S2, to: S3 }];

    expect(refusal(() => planWorkflow(current(), deletes)).code).toBe("bad_request");
  });

  it("refuses two statuses sharing a name in any case", () => {
    const input = unchanged();

    input.statuses[1] = { ...input.statuses[1]!, name: "to do" };

    expect(refusal(() => planWorkflow(current(), input)).code).toBe("bad_request");
  });

  it("refuses a status in a column the publish does not have", () => {
    const input = unchanged();

    input.statuses[0] = { ...input.statuses[0]!, column_id: C3 };

    expect(refusal(() => planWorkflow(current(), input)).code).toBe("bad_request");
  });

  it("refuses a repeated id", () => {
    const input = unchanged();

    input.columns.push({ id: C1, title: "Again" });

    expect(refusal(() => planWorkflow(current(), input)).code).toBe("bad_request");
  });

  it("diffs transitions into creates and deletes", () => {
    const input = unchanged();

    input.transitions = [{ from: S2, to: S1 }];

    const plan = planWorkflow(current(), input);

    expect(plan.createTransitions).toEqual([{ from: S2, to: S1 }]);
    expect(plan.deleteTransitions).toEqual([{ from: S1, to: S2 }]);
  });

  it("refuses a self transition, a duplicate and an unknown status", () => {
    const self = unchanged();
    self.transitions = [{ from: S1, to: S1 }];
    expect(refusal(() => planWorkflow(current(), self)).code).toBe("bad_request");

    const twice = unchanged();
    twice.transitions = [
      { from: S1, to: S2 },
      { from: S1, to: S2 },
    ];
    expect(refusal(() => planWorkflow(current(), twice)).code).toBe("bad_request");

    const unknown = unchanged();
    unknown.transitions = [{ from: S1, to: S4 }];
    expect(refusal(() => planWorkflow(current(), unknown)).code).toBe("bad_request");
  });

  it("allows an unmapped status, but not one that holds work", () => {
    const input = unchanged();

    input.statuses[1] = { ...input.statuses[1]!, column_id: null };

    expect(planWorkflow(current(), input).updateStatuses).toEqual([{ id: S2, column_id: null }]);
    expect(refusal(() => planWorkflow(current({ [S2]: 1 }), input)).code).toBe("conflict");
  });
});
