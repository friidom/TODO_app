import { beforeEach, describe, expect, it, vi } from "vitest";

import { addBacklogItem, addTodo, type TodoPatch } from "./todoApi";
import { TODO_FIELDS } from "@/types/data";

const { post } = vi.hoisted(() => ({
  post: vi.fn((_path: string, body: unknown) => Promise.resolve(body)),
}));

vi.mock("../api/client", () => ({
  api: { post },
  ApiError: class ApiError extends Error {},
}));

const sentBody = () => post.mock.calls.at(-1)?.[1] as Record<string, unknown>;

describe("a new work item's priority", () => {
  const base = {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    title: "New",
    status_id: "s1",
    board_id: "11111111-1111-4111-8111-111111111111",
  };

  beforeEach(() => post.mockClear());

  it("is medium when the caller names none (quick create)", async () => {
    await addTodo(base);

    expect(sentBody().priority).toBe("medium");
  });

  it("is medium for a child item too", async () => {
    await addTodo({ ...base, parent_id: "epic-1" });

    expect(sentBody().priority).toBe("medium");
  });

  it("keeps an explicit choice, including an explicit none", async () => {
    await addTodo({ ...base, priority: "highest" });
    expect(sentBody().priority).toBe("highest");

    await addTodo({ ...base, priority: null });
    expect(sentBody().priority).toBeNull();
  });

  it("is medium for an item created in the Backlog", async () => {
    await addBacklogItem({ ...base, backlog_rank: 1 });

    expect(sentBody().priority).toBe("medium");
  });
});

describe("TODO_FIELDS", () => {
  it("names no field twice", () => {
    expect(new Set(TODO_FIELDS).size).toBe(TODO_FIELDS.length);
  });

  it("carries the columns every view needs to place a card", () => {
    for (const field of [
      "id",
      "board_id",
      "status_id",
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
