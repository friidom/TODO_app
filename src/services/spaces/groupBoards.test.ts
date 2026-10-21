import { describe, expect, it } from "vitest";

import { spaceNameOf } from "./boardSpace";
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

function board(
  id: string,
  title: string | null,
  spaceId: string | null,
  spaceTitle?: string,
) {
  return {
    id,
    title,
    space_id: spaceId,
    space_title: spaceTitle,
    owner_id: "11111111-1111-4111-8111-111111111111",
    description: null,
    icon: null,
    cover_color: null,
    visibility: "private",
    sprints_enabled: true,
    workflow_enabled: true,
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
    const groups = groupBoardsBySpace([], [work]);

    expect(titles(groups)).toEqual([["Work", []]]);
  });

  it("files a board in someone else's space under that space, not as unfiled", () => {
    const theirs = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const groups = groupBoardsBySpace(
      [
        board("1", "Shared with me", theirs, "Design System"),
        board("2", "Also shared", theirs, "Design System"),
      ],
      [work],
    );

    expect(titles(groups)).toEqual([
      ["Design System", ["Also shared", "Shared with me"]],
      ["Work", []],
    ]);
    expect(groups.map((group) => group.owned)).toEqual([false, true]);
  });

  it("falls back to unfiled only when the space's name never arrived", () => {
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
    const groups = groupBoardsBySpace(
      [board("1", null, work.id), board("2", "Roadmap", work.id)],
      [work],
    );

    expect(groups[0].boards.map((b) => b.id)).toEqual(["1", "2"]);
  });
  it("puts a new account's board in its real default space, not the synthetic group", () => {
    // the group needs a real space row so Rename/Delete have something to target
    const mine = space("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "My Space");

    const groups = groupBoardsBySpace(
      [board("1", "My Board", mine.id)],
      [mine],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].space).not.toBeNull();
    expect(groups[0].space?.id).toBe(mine.id);
    expect(groups[0].boards.map((b) => b.title)).toEqual(["My Board"]);
  });

  it("returns the default space's boards to unfiled when it is deleted", () => {
    // space_id is on delete set null — deleting a space unfiles boards, never cascades
    const mine = space("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "My Space");
    const boards = [
      board("1", "My Board", mine.id),
      board("2", "Notes", mine.id),
    ];

    const before = groupBoardsBySpace(boards, [mine]);
    expect(before[0].boards).toHaveLength(2);

    const after = groupBoardsBySpace(
      boards.map((b) => ({ ...b, space_id: null })),
      [],
    );

    expect(after).toHaveLength(1);
    expect(after[0].space).toBeNull();
    expect(after[0].boards.map((b) => b.title)).toEqual(["My Board", "Notes"]);
  });

  it("gives the default space no special ordering", () => {
    // a space like any other once it exists — sorted by title, not pinned first
    const mine = space("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "My Space");

    const groups = groupBoardsBySpace([], [mine, work, personal]);

    expect(groups.map((g) => g.space?.title)).toEqual([
      "My Space",
      "Personal",
      "Work",
    ]);
  });
});

describe("spaceNameOf", () => {
  it("names the space a board is filed in, whoever owns it", () => {
    expect(
      spaceNameOf(
        board(
          "1",
          "Shared",
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          "Design System",
        ),
      ),
    ).toBe("Design System");
  });

  it("finds an owned space for a board the server has not answered for yet", () => {
    expect(spaceNameOf(board("1", "Draft", work.id), [work])).toBe("Work");
  });

  it("says unfiled for a board in no space, and nothing for a name it cannot know", () => {
    expect(spaceNameOf(board("1", "Loose", null))).toBe("Unfiled");
    expect(
      spaceNameOf(board("1", "Shared", "cccccccc-cccc-4ccc-8ccc-cccccccccccc")),
    ).toBeNull();
  });
});
