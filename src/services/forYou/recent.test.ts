import { describe, expect, it } from "vitest";

import type { IBoard, ISpace } from "@/types/data";
import type { FeedTodo } from "./feed";
import { buildRecent } from "./recent";

const board = (id: string, title: string, space_id: string | null = null) =>
  ({ id, title, key_prefix: id.toUpperCase(), space_id }) as IBoard;

const todo = (id: string, board_id: string, title: string, board_key = 1) =>
  ({ id, board_id, title, board_key }) as FeedTodo;

const NOW = new Date(2026, 9, 17, 12);
const today = new Date(2026, 9, 17, 9).toISOString();
const yesterday = new Date(2026, 9, 16, 9).toISOString();

const base = {
  boards: [board("core", "Core API", "s1"), board("web", "Web")],
  spaces: [{ id: "s1", title: "Platform" } as ISpace],
  todos: [todo("t1", "core", "Fix login"), todo("t2", "web", "Footer", 7)],
  visits: [
    { id: "web", at: yesterday, view: "list" },
    { id: "gone", at: today },
  ],
  viewed: [
    { id: "t1", boardId: "core", at: today },
    { id: "t-missing", boardId: "core", at: today },
  ],
  filter: "all" as const,
  query: "",
  now: NOW,
};

describe("buildRecent", () => {
  it("groups by period, newest first, dropping what the reader cannot resolve", () => {
    const groups = buildRecent(base);

    expect(groups.map((g) => g.period)).toEqual(["today", "yesterday"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["t1"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["web"]);
  });

  it("resumes a board on the view it was left on, and ignores an unknown one", () => {
    const [item] = buildRecent({ ...base, filter: "boards" })[0]!.items;

    expect(item!.href).toBe("/boards/web?view=list");

    const stale = buildRecent({
      ...base,
      filter: "boards",
      visits: [{ id: "web", at: today, view: "gantt" }],
    })[0]!.items[0]!;

    expect(stale.href).toBe("/boards/web");
  });

  it("links a task into its board", () => {
    const item = buildRecent({ ...base, filter: "tasks" })[0]!.items[0]!;

    expect(item.href).toBe("/boards/core?task=t1");
    expect(item.kind === "task" && item.key).toBe("CORE-1");
  });

  it("filters by kind and searches title, key, board and space", () => {
    const ids = (query: string) =>
      buildRecent({ ...base, query }).flatMap((g) => g.items.map((i) => i.id));

    expect(ids("login")).toEqual(["t1"]);
    expect(ids("core-1")).toEqual(["t1"]);
    expect(ids("platform")).toEqual(["t1"]);
    expect(ids("web")).toEqual(["web"]);
    expect(ids("nothing")).toEqual([]);
    expect(
      buildRecent({ ...base, filter: "tasks" }).flatMap((g) => g.items),
    ).toHaveLength(1);
  });
});
