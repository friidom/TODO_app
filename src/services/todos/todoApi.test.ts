import { describe, expect, it } from "vitest";

import { TODO_LIST_FIELDS } from "./todoApi";
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
});
