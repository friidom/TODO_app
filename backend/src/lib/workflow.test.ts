import { describe, expect, it } from "vitest";

import {
  WORKFLOW_STAGES,
  canTransition,
  isWorkflowStage,
  stageIndexOf,
  stagesBetween,
} from "./workflow.js";

describe("WORKFLOW_STAGES", () => {
  // The order IS the rule, so it is pinned rather than assumed. These are
  // columns_category_check's values, not a second vocabulary.
  it("is the column categories, in order", () => {
    expect(WORKFLOW_STAGES).toEqual(["todo", "in_progress", "in_review", "done"]);
  });
});

describe("canTransition", () => {
  it("allows each forward step", () => {
    expect(canTransition("todo", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "in_review")).toBe(true);
    expect(canTransition("in_review", "done")).toBe(true);
  });

  // The three the product forbids, and the reason in_review had to become a
  // category of its own: while In Review was filed as in_progress, the first
  // two of these read as a single step and could not be refused at all.
  it("REFUSES skipping a stage", () => {
    expect(canTransition("todo", "in_review")).toBe(false);
    expect(canTransition("in_progress", "done")).toBe(false);
    expect(canTransition("todo", "done")).toBe(false);
  });

  // A board may still have two columns sharing one category, so a sideways
  // move stays an ordinary board action rather than a transition.
  it("allows staying on the same stage", () => {
    for (const stage of WORKFLOW_STAGES) {
      expect(canTransition(stage, stage), stage).toBe(true);
    }
  });

  // Reopening finished work is not what the workflow is for; refusing it would
  // break the board rather than guard it.
  it("allows going back any distance", () => {
    expect(canTransition("done", "in_review")).toBe(true);
    expect(canTransition("done", "in_progress")).toBe(true);
    expect(canTransition("done", "todo")).toBe(true);
    expect(canTransition("in_review", "todo")).toBe(true);
    expect(canTransition("in_progress", "todo")).toBe(true);
  });

  // columns.category is nullable and the CHECK is the only thing narrowing it,
  // so a stage we cannot place is one we cannot sequence.
  it("does not constrain a category outside the sequence", () => {
    for (const outside of [null, undefined, "", "archived", "TODO"]) {
      expect(canTransition(outside, "done"), String(outside)).toBe(true);
      expect(canTransition("todo", outside), String(outside)).toBe(true);
    }
  });
});

describe("stagesBetween", () => {
  it("names what a refused move skipped", () => {
    expect(stagesBetween("todo", "in_review")).toEqual(["in_progress"]);
    expect(stagesBetween("in_progress", "done")).toEqual(["in_review"]);
    expect(stagesBetween("todo", "done")).toEqual(["in_progress", "in_review"]);
  });

  it("is empty for anything canTransition allows", () => {
    expect(stagesBetween("todo", "in_progress")).toEqual([]);
    expect(stagesBetween("done", "todo")).toEqual([]);
    expect(stagesBetween("todo", null)).toEqual([]);
  });
});

describe("stageIndexOf", () => {
  it("is null, not -1, off the sequence", () => {
    expect(stageIndexOf("todo")).toBe(0);
    expect(stageIndexOf("in_review")).toBe(2);
    expect(stageIndexOf("done")).toBe(3);
    expect(stageIndexOf("archived")).toBeNull();
    expect(stageIndexOf(null)).toBeNull();
  });
});

describe("isWorkflowStage", () => {
  it("accepts only the three categories", () => {
    expect(isWorkflowStage("in_progress")).toBe(true);
    expect(isWorkflowStage("In Progress")).toBe(false);
    expect(isWorkflowStage(2)).toBe(false);
  });
});
