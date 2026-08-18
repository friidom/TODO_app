import { describe, expect, it } from "vitest";

import type { Comment } from "@/types/data";
import {
  applyCommentDeleted,
  applyCommentInserted,
  applyCommentUpdated,
} from "./cache";

/**
 * `created_at` is what a thread is ordered by, so the fixtures take it as a
 * minute and build the rest — what is under test is identity and ordering, and
 * neither cares about the other five columns.
 */
const comment = (id: string, minute: number, over: Partial<Comment> = {}) =>
  ({
    id,
    board_id: "b-1",
    todo_id: "t-1",
    author_id: "u-1",
    content: `comment ${id}`,
    created_at: `2026-08-18T09:${String(minute).padStart(2, "0")}:00.000Z`,
    updated_at: `2026-08-18T09:${String(minute).padStart(2, "0")}:00.000Z`,
    ...over,
  }) as Comment;

const ids = (comments: Comment[]) => comments.map((it) => it.id);

describe("applyCommentInserted", () => {
  it("adds a comment the thread has never seen", () => {
    const thread = [comment("a", 1)];

    expect(ids(applyCommentInserted(thread, comment("b", 2)))).toEqual([
      "a",
      "b",
    ]);
  });

  it("puts an out-of-order arrival in posting order", () => {
    // Two clients posting in the same minute can arrive either way round, and
    // a thread that reads differently on each screen is the bug this avoids.
    const thread = [comment("a", 1), comment("c", 3)];

    expect(ids(applyCommentInserted(thread, comment("b", 2)))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("IGNORES AN ECHO OF THIS CLIENT'S OWN COMMENT", () => {
    // M6-10's rule, one table further out: the client mints the uuid, so its
    // own insert comes back carrying an id the cache already holds.
    const mine = comment("mine", 1, { content: "posted locally" });
    const thread = [mine];

    const echoed = comment("mine", 1, { content: "posted locally" });

    const result = applyCommentInserted(thread, echoed);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(mine);
    expect(result).toBe(thread);
  });

  it("does not mutate the thread it is given", () => {
    const thread = [comment("a", 1)];
    const before = [...thread];

    applyCommentInserted(thread, comment("b", 2));

    expect(thread).toEqual(before);
  });
});

describe("applyCommentUpdated", () => {
  it("replaces the whole row, so the trigger's updated_at comes through", () => {
    const thread = [comment("a", 1), comment("b", 2)];

    const edited = comment("a", 1, {
      content: "edited",
      updated_at: "2026-08-18T10:00:00.000Z",
    });

    const result = applyCommentUpdated(thread, edited);

    expect(result[0].content).toBe("edited");
    expect(result[0].updated_at).toBe("2026-08-18T10:00:00.000Z");
    // Untouched rows keep their identity, so React re-renders one comment.
    expect(result[1]).toBe(thread[1]);
  });

  it("drops an edit for a comment it does not have, rather than inventing it", () => {
    const thread = [comment("a", 1)];

    expect(applyCommentUpdated(thread, comment("ghost", 9))).toEqual(thread);
  });

  it("does not mutate the thread it is given", () => {
    const thread = [comment("a", 1)];
    const before = [...thread];

    applyCommentUpdated(thread, comment("a", 1, { content: "edited" }));

    expect(thread).toEqual(before);
  });
});

describe("applyCommentDeleted", () => {
  it("removes by id", () => {
    const thread = [comment("a", 1), comment("b", 2)];

    expect(ids(applyCommentDeleted(thread, "a"))).toEqual(["b"]);
  });

  it("is a no-op for an id the thread does not hold", () => {
    const thread = [comment("a", 1)];

    expect(ids(applyCommentDeleted(thread, "elsewhere"))).toEqual(["a"]);
  });

  it("does not mutate the thread it is given", () => {
    const thread = [comment("a", 1), comment("b", 2)];
    const before = [...thread];

    applyCommentDeleted(thread, "a");

    expect(thread).toEqual(before);
  });
});
