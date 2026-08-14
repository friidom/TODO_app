import { describe, expect, it } from "vitest";

import { boardIdsInScope } from "./scope";
import type { IBoard } from "@/types/data";

function board(id: string, spaceId: string | null): IBoard {
  return {
    id,
    space_id: spaceId,
    title: id,
    owner_id: "11111111-1111-4111-8111-111111111111",
    description: null,
    icon: null,
    cover_color: null,
    visibility: "private",
    next_key: 1,
    key_prefix: "KAN",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };
}

const boards = [board("b", "work"), board("a", "work"), board("c", null)];

describe("boardIdsInScope", () => {
  it("is just the board, for a board scope", () => {
    expect(boardIdsInScope({ kind: "board", boardId: "b" }, boards)).toEqual([
      "b",
    ]);
  });

  it("asks for nothing while the route param is unresolved", () => {
    // The board page renders before `useParams` has an id on the first paint.
    // An empty list means "no queries yet", which is the state the disabled
    // query already modelled.
    expect(
      boardIdsInScope({ kind: "board", boardId: undefined }, boards),
    ).toEqual([]);
  });

  it("does not filter a board scope through the board list", () => {
    // The open board must render before `useBoards()` resolves; checking
    // membership here would blank it for a tick.
    expect(boardIdsInScope({ kind: "board", boardId: "unknown" }, [])).toEqual([
      "unknown",
    ]);
  });

  it("covers every board filed in a space", () => {
    expect(boardIdsInScope({ kind: "space", spaceId: "work" }, boards)).toEqual(
      ["a", "b"],
    );
  });

  it("treats a null space as the unfiled group", () => {
    // Where a board shared with you lives: its space belongs to someone else,
    // so RLS never returns the space row and the board reads as unfiled (M15).
    expect(boardIdsInScope({ kind: "space", spaceId: null }, boards)).toEqual([
      "c",
    ]);
  });

  it("covers everything reachable, for an all scope", () => {
    expect(boardIdsInScope({ kind: "all" }, boards)).toEqual(["a", "b", "c"]);
  });

  it("returns ids in a stable order whatever order the boards arrive in", () => {
    // The id list keys the queries beneath it. If it reordered on every
    // refetch of the board list, every board query would be torn down and
    // restarted for nothing.
    const shuffled = [boards[2], boards[0], boards[1]];

    expect(boardIdsInScope({ kind: "all" }, shuffled)).toEqual(
      boardIdsInScope({ kind: "all" }, boards),
    );
  });
});
