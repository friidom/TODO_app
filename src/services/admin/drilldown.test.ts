import { describe, expect, it } from "vitest";

import { boardTrail, spaceTarget, spaceTrail, taskTarget } from "./drilldown";

describe("taskTarget", () => {
  it("opens the panel for a todo row", () => {
    expect(taskTarget({ entity_type: "todo", entity_id: "t1" })).toBe("t1");
  });

  it("is null for an entity with no task behind it", () => {
    expect(taskTarget({ entity_type: "column", entity_id: "c1" })).toBeNull();
    expect(taskTarget({ entity_type: "member", entity_id: "m1" })).toBeNull();
  });

  // activities.entity_id carries no foreign key and is nullable, so a row can
  // name a todo that no longer exists or none at all.
  it("is null when the row names no entity", () => {
    expect(taskTarget({ entity_type: "todo", entity_id: null })).toBeNull();
  });
});

describe("boardTrail", () => {
  it("walks Boards to space to board", () => {
    expect(
      boardTrail({
        title: "Core API",
        space_id: "s1",
        space_title: "Engineering",
      }),
    ).toEqual([
      { label: "Boards", to: "/admin/boards" },
      { label: "Engineering", to: "/admin/spaces/s1" },
      { label: "Core API" },
    ]);
  });

  it("skips the space step for an unfiled board", () => {
    const trail = boardTrail({
      title: "Loose",
      space_id: null,
      space_title: null,
    });

    expect(trail).toHaveLength(2);
    expect(trail.at(-1)).toEqual({ label: "Loose" });
  });

  it("names an untitled board rather than rendering a gap", () => {
    expect(
      boardTrail({ title: null, space_id: null, space_title: null }).at(-1),
    ).toEqual({
      label: "Untitled board",
    });
  });

  it("leaves the last crumb without a link, because it is the current page", () => {
    expect(
      boardTrail({ title: "Core API", space_id: "s1", space_title: "Eng" }).at(
        -1,
      )?.to,
    ).toBeUndefined();
  });
});

describe("spaceTrail", () => {
  it("walks All spaces to the space", () => {
    expect(spaceTrail({ title: "Engineering" })).toEqual([
      { label: "All spaces", to: "/admin/spaces" },
      { label: "Engineering" },
    ]);
  });
});

describe("spaceTarget", () => {
  it("carries the period across the hop so context survives", () => {
    expect(spaceTarget({ id: "s1" }, "30d")).toBe(
      "/admin/spaces/s1?period=30d",
    );
  });

  it("refuses to open the Unfiled bucket, which is a grouping and not a space", () => {
    expect(spaceTarget({ id: null }, "30d")).toBeNull();
  });
});
