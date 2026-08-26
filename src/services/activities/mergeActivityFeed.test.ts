import { describe, expect, it } from "vitest";

import { mergeActivityFeed } from "./mergeActivityFeed";
import type { Activity, Comment } from "@/types/data";

function comment(id: string, created_at: string): Comment {
  return {
    id,
    board_id: "board-1",
    todo_id: "todo-1",
    author_id: "user-a",
    content: `comment ${id}`,
    created_at,
    updated_at: created_at,
  };
}

function activity(id: string, created_at: string): Activity {
  return {
    id,
    board_id: "board-1",
    actor_id: "user-a",
    entity_type: "todo",
    entity_id: "todo-1",
    action: "priority_changed",
    payload: {},
    created_at,
  };
}

describe("mergeActivityFeed", () => {
  it("returns an empty list for no comments and no history", () => {
    expect(mergeActivityFeed([], [])).toEqual([]);
  });

  it("sorts a mix of both kinds newest first", () => {
    const c1 = comment("c1", "2026-08-26T09:00:00.000Z");
    const a1 = activity("a1", "2026-08-26T10:00:00.000Z");
    const c2 = comment("c2", "2026-08-26T08:00:00.000Z");
    const a2 = activity("a2", "2026-08-26T11:00:00.000Z");

    const result = mergeActivityFeed([c1, c2], [a1, a2]);

    expect(result.map((entry) => entry.at)).toEqual([
      "2026-08-26T11:00:00.000Z",
      "2026-08-26T10:00:00.000Z",
      "2026-08-26T09:00:00.000Z",
      "2026-08-26T08:00:00.000Z",
    ]);
  });

  it("keeps comments as comments and history as history", () => {
    const c1 = comment("c1", "2026-08-26T09:00:00.000Z");
    const a1 = activity("a1", "2026-08-26T10:00:00.000Z");

    const result = mergeActivityFeed([c1], [a1]);

    expect(result[0]).toEqual({
      kind: "history",
      at: a1.created_at,
      activity: a1,
    });
    expect(result[1]).toEqual({
      kind: "comment",
      at: c1.created_at,
      comment: c1,
    });
  });

  it("orders comments alone newest first, reversing their own storage order", () => {
    // Comments are fetched oldest-first for the standalone thread
    // (`fetchComments`'s own convention). The merged "All" tab is a different
    // view over the same rows and must not inherit that order.
    const oldest = comment("c1", "2026-08-26T08:00:00.000Z");
    const newest = comment("c2", "2026-08-26T09:00:00.000Z");

    const result = mergeActivityFeed([oldest, newest], []);

    expect(result.map((entry) => entry.at)).toEqual([
      newest.created_at,
      oldest.created_at,
    ]);
  });

  it("orders history alone newest first, matching the board feed's convention", () => {
    const oldest = activity("a1", "2026-08-26T08:00:00.000Z");
    const newest = activity("a2", "2026-08-26T09:00:00.000Z");

    const result = mergeActivityFeed([], [oldest, newest]);

    expect(result.map((entry) => entry.at)).toEqual([
      newest.created_at,
      oldest.created_at,
    ]);
  });

  it("does not mutate its inputs", () => {
    const comments = [
      comment("c1", "2026-08-26T08:00:00.000Z"),
      comment("c2", "2026-08-26T09:00:00.000Z"),
    ];
    const activities = [activity("a1", "2026-08-26T07:00:00.000Z")];

    const commentsCopy = [...comments];
    const activitiesCopy = [...activities];

    mergeActivityFeed(comments, activities);

    expect(comments).toEqual(commentsCopy);
    expect(activities).toEqual(activitiesCopy);
  });
});
