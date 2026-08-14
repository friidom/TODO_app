import { describe, expect, it } from "vitest";

import { groupBoardsBySpace } from "./groupBoards";
import type { IBoard, ISpace } from "@/types/data";

function space(id: string, title: string): ISpace {
  return {
    id,
    title,
    owner_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };
}

function board(id: string, title: string | null, spaceId: string | null) {
  return {
    id,
    title,
    space_id: spaceId,
    owner_id: "11111111-1111-4111-8111-111111111111",
    description: null,
    icon: null,
    cover_color: null,
    visibility: "private",
    next_key: 1,
    key_prefix: "KAN",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  } satisfies IBoard;
}

const work = space("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Work");
const personal = space("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Personal");

const titles = (groups: ReturnType<typeof groupBoardsBySpace>) =>
  groups.map((group) => [
    group.space?.title ?? null,
    group.boards.map((b) => b.title),
  ]);

describe("groupBoardsBySpace", () => {
  it("files each board under its space, spaces and boards by title", () => {
    const groups = groupBoardsBySpace(
      [
        board("1", "Roadmap", work.id),
        board("2", "Errands", personal.id),
        board("3", "Backlog", work.id),
      ],
      [work, personal],
    );

    expect(titles(groups)).toEqual([
      ["Personal", ["Errands"]],
      ["Work", ["Backlog", "Roadmap"]],
    ]);
  });

  it("keeps a space with no boards in it", () => {
    // A folder you made and have not filled is still yours, and hiding it would
    // leave no target to file the first board into.
    const groups = groupBoardsBySpace([], [work]);

    expect(titles(groups)).toEqual([["Work", []]]);
  });

  it("treats a board in someone else's space as unfiled", () => {
    // The normal state of a shared board, not an edge case: spaces are
    // owner-only, so a board a teammate filed carries a space_id whose row RLS
    // never returns to this caller. It belongs in no folder of theirs.
    const groups = groupBoardsBySpace(
      [board("1", "Shared with me", "cccccccc-cccc-4ccc-8ccc-cccccccccccc")],
      [work],
    );

    expect(titles(groups)).toEqual([
      ["Work", []],
      [null, ["Shared with me"]],
    ]);
  });

  it("puts the unfiled group last and drops it when empty", () => {
    const withUnfiled = groupBoardsBySpace(
      [board("1", "Loose", null), board("2", "Roadmap", work.id)],
      [work],
    );

    expect(titles(withUnfiled)).toEqual([
      ["Work", ["Roadmap"]],
      [null, ["Loose"]],
    ]);

    const noUnfiled = groupBoardsBySpace(
      [board("2", "Roadmap", work.id)],
      [work],
    );

    expect(noUnfiled.some((group) => group.space === null)).toBe(false);
  });

  it("shows every board exactly once", () => {
    // The property that matters most in a sidebar: a board the user cannot find
    // is indistinguishable from one that was deleted.
    const boards = [
      board("1", "Roadmap", work.id),
      board("2", "Loose", null),
      board("3", "Elsewhere", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    ];

    const seen = groupBoardsBySpace(boards, [work, personal])
      .flatMap((group) => group.boards)
      .map((b) => b.id);

    expect(seen.sort()).toEqual(["1", "2", "3"]);
  });

  it("sorts an untitled board without throwing", () => {
    // `boards.title` is nullable and the UI labels it "Untitled board".
    const groups = groupBoardsBySpace(
      [board("1", null, work.id), board("2", "Roadmap", work.id)],
      [work],
    );

    expect(groups[0].boards.map((b) => b.id)).toEqual(["1", "2"]);
  });
});
