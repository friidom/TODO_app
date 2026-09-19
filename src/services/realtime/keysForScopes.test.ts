import { describe, expect, it } from "vitest";

import { queryKeys } from "@/services/queryClient/queryKeys";
import { ALL_SCOPES, keysForScopes, type Scope } from "./keysForScopes";

const BOARD = "board-1";

describe("keysForScopes", () => {
  it("maps a scope to the key the hooks already use, not to a second spelling", () => {
    expect(keysForScopes(["todos"], BOARD)).toEqual([[...queryKeys.todos(BOARD)]]);
    expect(keysForScopes(["columns"], BOARD)).toEqual([[...queryKeys.columns(BOARD)]]);
    expect(keysForScopes(["sprints"], BOARD)).toEqual([[...queryKeys.sprints(BOARD)]]);
    expect(keysForScopes(["members"], BOARD)).toEqual([[...queryKeys.members(BOARD)]]);
  });

  it("invalidates the whole comment family, because a thread is keyed by todo", () => {
    expect(keysForScopes(["comments"], BOARD)).toEqual([[...queryKeys.commentThreads()]]);
  });

  it("invalidates the whole attachment family for the same reason", () => {
    expect(keysForScopes(["attachments"], BOARD)).toEqual([["attachments"]]);
  });

  it("gives the boards scope both the one board and the index", () => {
    expect(keysForScopes(["boards"], BOARD)).toEqual([
      [...queryKeys.board(BOARD)],
      [...queryKeys.boards()],
    ]);
  });

  it("returns nothing for no scopes", () => {
    expect(keysForScopes([], BOARD)).toEqual([]);
  });

  it("combines scopes in order", () => {
    expect(keysForScopes(["columns", "todos"], BOARD)).toEqual([
      [...queryKeys.columns(BOARD)],
      [...queryKeys.todos(BOARD)],
    ]);
  });

  it("does not repeat a key a scope names twice", () => {
    expect(keysForScopes(["todos", "todos"], BOARD)).toEqual([[...queryKeys.todos(BOARD)]]);
  });

  it("carries an undefined board through rather than inventing one", () => {
    expect(keysForScopes(["todos"], undefined)).toEqual([["todos", undefined]]);
  });

  it("ignores a scope the server invented that this client does not know", () => {
    expect(keysForScopes(["nonsense" as Scope], BOARD)).toEqual([]);
  });

  it("covers every scope the server can send", () => {
    const keys = keysForScopes(ALL_SCOPES, BOARD);

    expect(keys).toHaveLength(8);
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(8);
  });
});
