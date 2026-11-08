import { describe, expect, it } from "vitest";

import type { IBoard } from "@/types/data";
import { applyStarToggled, starredBoards, type Star } from "./starred";

const board = (id: string) => ({ id, title: id }) as IBoard;

describe("starredBoards", () => {
  it("orders newest star first and drops boards the reader cannot see", () => {
    const stars: Star[] = [
      { board_id: "a", starred_at: "2026-10-01T00:00:00Z" },
      { board_id: "gone", starred_at: "2026-10-03T00:00:00Z" },
      { board_id: "b", starred_at: "2026-10-02T00:00:00Z" },
    ];

    expect(
      starredBoards([board("a"), board("b")], stars).map((it) => it.id),
    ).toEqual(["b", "a"]);
  });
});

describe("applyStarToggled", () => {
  const stars: Star[] = [{ board_id: "a", starred_at: "2026-10-01T00:00:00Z" }];

  it("adds to the front without duplicating", () => {
    const once = applyStarToggled(stars, "b", true, "now");
    const twice = applyStarToggled(once, "b", true, "later");

    expect(twice.map((it) => it.board_id)).toEqual(["b", "a"]);
  });

  it("removes, and removing a missing star changes nothing", () => {
    expect(applyStarToggled(stars, "a", false, "now")).toEqual([]);
    expect(applyStarToggled(stars, "x", false, "now")).toEqual(stars);
  });
});
