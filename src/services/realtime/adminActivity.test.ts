import { describe, expect, it } from "vitest";

import { adminActivityEffects, matchesAdminScope } from "./adminActivity";
import type { AdminActivityEvent } from "./socket";

function event(
  boardId: string,
  entityId: string | null = null,
): AdminActivityEvent {
  return { boardId, entity: "todo", entityId };
}

describe("matchesAdminScope", () => {
  it("accepts everything when the feed is system-wide", () => {
    expect(matchesAdminScope(event("b1"), {})).toBe(true);
    expect(matchesAdminScope(event("b2"), {})).toBe(true);
  });

  it("accepts only its own board when scoped to one", () => {
    expect(matchesAdminScope(event("b1"), { board: "b1" })).toBe(true);
    expect(matchesAdminScope(event("b2"), { board: "b1" })).toBe(false);
  });

  it("accepts a board filed into the scoped space", () => {
    const scope = { space: "s1", spaceBoardIds: ["b1", "b2"] };

    expect(matchesAdminScope(event("b1"), scope)).toBe(true);
    expect(matchesAdminScope(event("b9"), scope)).toBe(false);
  });

  // Refetching a feed the event cannot belong to is worse than missing a beat,
  // so an unknown board list declines rather than guesses.
  it("declines while the space's board list is still unknown", () => {
    expect(matchesAdminScope(event("b1"), { space: "s1" })).toBe(false);
    expect(
      matchesAdminScope(event("b1"), { space: "s1", spaceBoardIds: [] }),
    ).toBe(false);
  });

  it("lets the board filter win when both are set", () => {
    const scope = { board: "b1", space: "s1", spaceBoardIds: ["b2"] };

    expect(matchesAdminScope(event("b1"), scope)).toBe(true);
    expect(matchesAdminScope(event("b2"), scope)).toBe(false);
  });
});

describe("adminActivityEffects", () => {
  it("refreshes the feed for an event in scope", () => {
    expect(adminActivityEffects(event("b1"), {})).toEqual({
      activity: true,
      task: null,
    });
  });

  it("leaves an out-of-scope feed alone", () => {
    expect(adminActivityEffects(event("b2"), { board: "b1" })).toEqual({
      activity: false,
      task: null,
    });
  });

  // The panel is URL state, so nothing here closes it — only the task's own
  // query is refreshed underneath it.
  it("refreshes the open task when its own activity arrives", () => {
    expect(adminActivityEffects(event("b1", "t1"), {}, "t1")).toEqual({
      activity: true,
      task: "t1",
    });
  });

  it("leaves the open task alone when another task changes", () => {
    expect(adminActivityEffects(event("b1", "t2"), {}, "t1").task).toBeNull();
  });

  it("refreshes an open task even when the feed itself is out of scope", () => {
    expect(
      adminActivityEffects(event("b2", "t1"), { board: "b1" }, "t1"),
    ).toEqual({
      activity: false,
      task: "t1",
    });
  });

  it("has nothing to do for an event carrying no entity", () => {
    expect(adminActivityEffects(event("b1", null), {}, "t1").task).toBeNull();
  });

  // Invalidation is idempotent by construction: the feed is refetched, never
  // appended to, so a redelivered event cannot duplicate a row.
  it("is a pure decision, so a duplicate event decides identically", () => {
    const duplicate = event("b1", "t1");

    expect(adminActivityEffects(duplicate, {}, "t1")).toEqual(
      adminActivityEffects(duplicate, {}, "t1"),
    );
  });
});
