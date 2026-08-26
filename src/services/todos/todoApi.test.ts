import { describe, expect, it } from "vitest";

import { TODO_LIST_FIELDS, type TodoPatch } from "./todoApi";
import { TODO_FIELDS } from "@/types/data";

/**
 * The shared row shape, pinned from both ends (M16).
 *
 * `TODO_FIELDS` is what the `Todo` type is a `Pick` over; `TODO_LIST_FIELDS` is
 * what PostgREST is asked for. They cannot be one constant — `supabase-js`
 * infers the returned row from the select's *literal* type, so a derived string
 * collapses every query's result to `GenericStringError[]`.
 *
 * So they are written twice and checked here. Before M16 they were written
 * twice and checked by a comment.
 */
describe("TODO_LIST_FIELDS", () => {
  it("selects exactly the fields the Todo type claims to hold", () => {
    // Adding a column to one and not the other is the failure this catches:
    // a field in the type but not the select is `undefined` at runtime on
    // every card, and a field in the select but not the type is bytes fetched
    // for nobody — the waste M5-07 removed.
    expect(TODO_LIST_FIELDS).toBe(TODO_FIELDS.join(", "));
  });

  it("names no field twice", () => {
    expect(new Set(TODO_FIELDS).size).toBe(TODO_FIELDS.length);
  });

  it("carries the columns every view needs to place a card", () => {
    // The four views share this row. A calendar needs `due_date`, the board
    // needs `column_id` and `position`, and all of them need identity — so
    // these are the ones that must never be narrowed away as "unused".
    for (const field of [
      "id",
      "board_id",
      "column_id",
      "position",
      "board_key",
      "title",
      "due_date",
    ]) {
      expect(TODO_FIELDS).toContain(field);
    }
  });

  it("carries estimate (M24), so a written value survives in the board cache", () => {
    // Regression guard for the M5-07 exclusion this reverses for one field:
    // `estimate` was dropped as "a number rendered by nothing" and stays
    // dropped for `description`, `archived`, `creator_id`, `status` and
    // `previous_status`. Only `estimate` came back, once M24 gave it a reader,
    // and this pins that it does not silently fall out of the shared row again.
    expect(TODO_FIELDS).toContain("estimate");
  });
});

describe("TodoPatch", () => {
  it("admits estimate as a writable field", () => {
    // Type-level: this only needs to compile. `estimate` joining the allow-list
    // is M24's other required edit — `TodoPatch` is a narrow `Pick`, so leaving
    // a field out of it is a control that can never write that column, caught
    // here at compile time rather than by a control silently doing nothing.
    const patch: TodoPatch = {
      id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      board_id: "11111111-1111-4111-8111-111111111111",
      estimate: 5,
    };

    expect(patch.estimate).toBe(5);
  });

  it("keeps null distinct from a written zero", () => {
    // The distinction M24 requires every rollup to preserve: unestimated and
    // estimated-at-zero are different facts, and `TodoPatch` has to be able to
    // state either explicitly rather than collapsing one into the other.
    const unset: TodoPatch = { id: "x", board_id: "y", estimate: null };
    const zero: TodoPatch = { id: "x", board_id: "y", estimate: 0 };

    expect(unset.estimate).toBeNull();
    expect(zero.estimate).toBe(0);
  });
});
