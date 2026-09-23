import { describe, expect, it } from "vitest";

import { SORT_KEYS } from "@/services/todos/view";
import type { Todo } from "@/types/data";
import {
  FILTER_DEFINITIONS,
  FILTER_IDS,
  filterDefinitions,
  filterPath,
  isFilterId,
  type FilterContext,
} from "./registry";

const ME = "11111111-1111-4111-8111-111111111111";
const DONE = "22222222-2222-4222-8222-222222222222";
const TODO_COL = "33333333-3333-4333-8333-333333333333";

const context: FilterContext = { userId: ME, doneColumnIds: new Set([DONE]) };

function todo(over: Partial<Todo> & { id: string }): Todo {
  return {
    board_id: "b-1",
    column_id: TODO_COL,
    assignee_id: null,
    creator_id: null,
    completed_at: null,
    parent_id: null,
    sprint_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  } as Todo;
}

const keep = (id: (typeof FILTER_IDS)[number], row: Todo) =>
  FILTER_DEFINITIONS[id].match?.(row, context) ?? true;

describe("filter registry", () => {
  it("declares the nine predefined filters", () => {
    expect(FILTER_IDS).toHaveLength(9);
    expect(filterDefinitions().map((f) => f.id)).toEqual([...FILTER_IDS]);
  });

  it("has a definition keyed by its own id, with a label", () => {
    for (const id of FILTER_IDS) {
      expect(FILTER_DEFINITIONS[id].id).toBe(id);
      expect(FILTER_DEFINITIONS[id].label.length).toBeGreaterThan(0);
    }
  });

  // A sort key the pipeline does not know would silently order by nothing.
  it("only names sort keys sortTodos implements", () => {
    for (const definition of filterDefinitions()) {
      if (definition.sort) {
        expect(SORT_KEYS).toContain(definition.sort.key);
      }
    }
  });

  it("recognises only declared ids", () => {
    expect(isFilterId("my-open")).toBe(true);
    expect(isFilterId("everything")).toBe(false);
    expect(filterPath("done-work")).toBe("/filters/done-work");
  });
});

describe("filter predicates", () => {
  it("my open work: mine and not in a done column", () => {
    expect(keep("my-open", todo({ id: "a", assignee_id: ME }))).toBe(true);
    expect(
      keep("my-open", todo({ id: "b", assignee_id: ME, column_id: DONE })),
    ).toBe(false);
    expect(keep("my-open", todo({ id: "c", assignee_id: "someone" }))).toBe(false);
  });

  it("reported by me: the creator, not the assignee", () => {
    expect(keep("reported-by-me", todo({ id: "a", creator_id: ME }))).toBe(true);
    expect(keep("reported-by-me", todo({ id: "b", assignee_id: ME }))).toBe(false);
  });

  it("all work keeps everything, having no condition", () => {
    expect(keep("all-work", todo({ id: "a", column_id: DONE }))).toBe(true);
    expect(FILTER_DEFINITIONS["all-work"].match).toBeUndefined();
  });

  it("open and done work are complements over the done columns", () => {
    const open = todo({ id: "a" });
    const done = todo({ id: "b", column_id: DONE });

    expect(keep("open-work", open)).toBe(true);
    expect(keep("done-work", open)).toBe(false);
    expect(keep("open-work", done)).toBe(false);
    expect(keep("done-work", done)).toBe(true);
  });

  // A backlog card has no column, so it is open rather than done.
  it("treats a card with no column as open", () => {
    const backlog = todo({ id: "a", column_id: null });

    expect(keep("open-work", backlog)).toBe(true);
    expect(keep("done-work", backlog)).toBe(false);
  });

  // The stamp, not the column: 0013 clears completed_at when a card leaves Done,
  // so a reopened card stops being "resolved recently".
  it("resolved recently reads completed_at", () => {
    expect(
      keep("resolved-recently", todo({ id: "a", completed_at: "2026-09-02T00:00:00.000Z" })),
    ).toBe(true);
    expect(keep("resolved-recently", todo({ id: "b", column_id: DONE }))).toBe(false);
  });

  it("keeps nothing personal when there is no signed-in user", () => {
    const anonymous: FilterContext = { userId: undefined, doneColumnIds: new Set() };

    expect(
      FILTER_DEFINITIONS["my-open"].match?.(todo({ id: "a", assignee_id: null }), anonymous),
    ).toBe(false);
    expect(
      FILTER_DEFINITIONS["reported-by-me"].match?.(
        todo({ id: "b", creator_id: null }),
        anonymous,
      ),
    ).toBe(false);
  });
});
