import { describe, expect, it } from "vitest";

import { TODO_LIST_FIELDS, type TodoPatch } from "./todoApi";
import { TODO_FIELDS } from "@/types/data";

describe("TODO_LIST_FIELDS", () => {
  it("selects exactly the fields the Todo type claims to hold", () => {
    expect(TODO_LIST_FIELDS).toBe(TODO_FIELDS.join(", "));
  });

  it("names no field twice", () => {
    expect(new Set(TODO_FIELDS).size).toBe(TODO_FIELDS.length);
  });

  it("carries the columns every view needs to place a card", () => {
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
    expect(TODO_FIELDS).toContain("estimate");
  });
});

describe("TodoPatch", () => {
  it("admits estimate as a writable field", () => {
    // compile-time check — a field missing from TodoPatch can never write that column
    const patch: TodoPatch = {
      id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      board_id: "11111111-1111-4111-8111-111111111111",
      estimate: 5,
    };

    expect(patch.estimate).toBe(5);
  });

  it("keeps null distinct from a written zero", () => {
    const unset: TodoPatch = { id: "x", board_id: "y", estimate: null };
    const zero: TodoPatch = { id: "x", board_id: "y", estimate: 0 };

    expect(unset.estimate).toBeNull();
    expect(zero.estimate).toBe(0);
  });
});
