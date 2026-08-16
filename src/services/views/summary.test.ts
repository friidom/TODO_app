import { describe, expect, it } from "vitest";

import {
  categoryIndex,
  priorityDistribution,
  recentCounts,
  statusDistribution,
  summaryStats,
  typeDistribution,
  workload,
} from "./summary";
import type { IColumn, Todo } from "@/types/data";

const TODAY = "2026-08-15";

const COLUMNS = [
  { id: "c-todo", category: "todo" },
  { id: "c-doing", category: "in_progress" },
  { id: "c-done", category: "done" },
  { id: "c-null", category: null },
] as unknown as IColumn[];

const INDEX = categoryIndex(COLUMNS);

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    column_id: "c-todo",
    position: 0,
    rank: "a0",
    board_key: seq,
    title: `Item ${seq}`,
    type: "Task",
    priority: null,
    due_date: null,
    assignee_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...over,
  } as Todo;
}

describe("categoryIndex", () => {
  it("defaults a null category to todo, matching categoryOf()", () => {
    expect(INDEX.get("c-null")).toBe("todo");
  });
});

describe("summaryStats", () => {
  it("splits the total across exactly three buckets", () => {
    const stats = summaryStats(
      [
        todo({ column_id: "c-todo" }),
        todo({ column_id: "c-doing" }),
        todo({ column_id: "c-done" }),
        todo({ column_id: "c-done" }),
      ],
      INDEX,
      TODAY,
    );

    expect(stats).toMatchObject({ total: 4, todo: 1, inProgress: 1, done: 2 });
    expect(stats.todo + stats.inProgress + stats.done).toBe(stats.total);
  });

  it("counts an item in no column as todo rather than dropping it", () => {
    // The invariant the progress bar depends on: the three buckets always sum
    // to the total, whatever state the column query is in.
    const stats = summaryStats([todo({ column_id: null })], INDEX, TODAY);

    expect(stats.total).toBe(1);
    expect(stats.todo).toBe(1);
  });

  it("counts an item whose column has not loaded as todo", () => {
    const stats = summaryStats(
      [todo({ column_id: "c-unknown" })],
      INDEX,
      TODAY,
    );

    expect(stats.todo + stats.inProgress + stats.done).toBe(1);
  });

  it("agrees with dueStatus about what is overdue", () => {
    const stats = summaryStats(
      [
        todo({ due_date: "2026-08-14", column_id: "c-todo" }),
        todo({ due_date: "2026-08-15", column_id: "c-todo" }),
        todo({ due_date: "2026-08-16", column_id: "c-todo" }),
      ],
      INDEX,
      TODAY,
    );

    expect(stats.overdue).toBe(1);
    expect(stats.dueToday).toBe(1);
  });

  it("never counts a finished task as overdue", () => {
    // Otherwise the number only ever grows, and a board that ships late work
    // looks permanently on fire.
    const stats = summaryStats(
      [todo({ due_date: "2026-01-01", column_id: "c-done" })],
      INDEX,
      TODAY,
    );

    expect(stats.overdue).toBe(0);
    expect(stats.done).toBe(1);
  });

  it("counts only open items as unassigned", () => {
    const stats = summaryStats(
      [
        todo({ column_id: "c-todo", assignee_id: null }),
        todo({ column_id: "c-done", assignee_id: null }),
        todo({ column_id: "c-todo", assignee_id: "user-a" }),
      ],
      INDEX,
      TODAY,
    );

    expect(stats.unassigned).toBe(1);
  });

  it("returns zeroes for an empty board", () => {
    expect(summaryStats([], INDEX, TODAY)).toEqual({
      total: 0,
      todo: 0,
      inProgress: 0,
      done: 0,
      overdue: 0,
      dueToday: 0,
      unassigned: 0,
    });
  });
});

describe("workload", () => {
  it("counts open items per assignee, heaviest first", () => {
    const entries = workload(
      [
        todo({ assignee_id: "user-a" }),
        todo({ assignee_id: "user-a" }),
        todo({ assignee_id: "user-b" }),
      ],
      INDEX,
      TODAY,
    );

    expect(entries).toEqual([
      { assigneeId: "user-a", open: 2, overdue: 0 },
      { assigneeId: "user-b", open: 1, overdue: 0 },
    ]);
  });

  it("ignores done work, so load is what is left rather than tenure", () => {
    const entries = workload(
      [
        todo({ assignee_id: "user-a", column_id: "c-done" }),
        todo({ assignee_id: "user-b", column_id: "c-todo" }),
      ],
      INDEX,
      TODAY,
    );

    expect(entries).toEqual([{ assigneeId: "user-b", open: 1, overdue: 0 }]);
  });

  it("keeps unassigned as its own bucket", () => {
    const entries = workload([todo({ assignee_id: null })], INDEX, TODAY);

    expect(entries[0].assigneeId).toBeNull();
  });

  it("tracks overdue within a person's load", () => {
    const entries = workload(
      [
        todo({ assignee_id: "user-a", due_date: "2026-01-01" }),
        todo({ assignee_id: "user-a", due_date: "2026-12-01" }),
      ],
      INDEX,
      TODAY,
    );

    expect(entries[0]).toEqual({ assigneeId: "user-a", open: 2, overdue: 1 });
  });

  it("orders ties by id so the list does not shuffle between renders", () => {
    const entries = workload(
      [todo({ assignee_id: "user-z" }), todo({ assignee_id: "user-a" })],
      INDEX,
      TODAY,
    );

    expect(entries.map((e) => e.assigneeId)).toEqual(["user-a", "user-z"]);
  });
});

describe("recentCounts", () => {
  const NOW = new Date("2026-08-15T12:00:00Z");

  it("counts what arrived inside the window", () => {
    const counts = recentCounts(
      [
        todo({ created_at: "2026-08-14T00:00:00Z" }),
        todo({ created_at: "2026-07-01T00:00:00Z" }),
      ],
      INDEX,
      NOW,
      7,
    );

    expect(counts.created).toBe(1);
  });

  it("does not read a brand-new card as an updated one", () => {
    // The distinction the whole function turns on: `updated_at` equal to
    // `created_at` means nobody has touched it, so a week of new cards must not
    // also read as a week of edits.
    const counts = recentCounts(
      [
        todo({
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        }),
      ],
      INDEX,
      NOW,
      7,
    );

    expect(counts.created).toBe(1);
    expect(counts.updated).toBe(0);
  });

  it("treats a null updated_at as never edited", () => {
    const counts = recentCounts(
      [todo({ created_at: "2026-08-14T00:00:00Z", updated_at: null })],
      INDEX,
      NOW,
      7,
    );

    expect(counts.updated).toBe(0);
  });

  it("counts a genuine edit inside the window", () => {
    const counts = recentCounts(
      [
        todo({
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        }),
      ],
      INDEX,
      NOW,
      7,
    );

    expect(counts.created).toBe(0);
    expect(counts.updated).toBe(1);
  });

  it("counts what is due inside the window and excludes what is already late", () => {
    const counts = recentCounts(
      [
        todo({ due_date: "2026-08-16" }),
        todo({ due_date: "2026-08-15" }),
        todo({ due_date: "2026-08-01" }),
        todo({ due_date: "2026-09-30" }),
      ],
      INDEX,
      NOW,
      7,
    );

    expect(counts.dueSoon).toBe(2);
  });

  it("does not call finished work due soon", () => {
    const counts = recentCounts(
      [todo({ due_date: "2026-08-16", column_id: "c-done" })],
      INDEX,
      NOW,
      7,
    );

    expect(counts.dueSoon).toBe(0);
  });
});

describe("statusDistribution", () => {
  it("counts per column, in the board's own column order", () => {
    const slices = statusDistribution(
      [
        todo({ column_id: "c-todo" }),
        todo({ column_id: "c-todo" }),
        todo({ column_id: "c-done" }),
      ],
      COLUMNS,
    );

    expect(slices).toEqual([
      { key: "c-todo", count: 2 },
      { key: "c-doing", count: 0 },
      { key: "c-done", count: 1 },
      { key: "c-null", count: 0 },
    ]);
  });

  it("keeps empty columns, because they are part of the board's shape", () => {
    const slices = statusDistribution([], COLUMNS);

    expect(slices).toHaveLength(COLUMNS.length);
    expect(slices.every((slice) => slice.count === 0)).toBe(true);
  });

  it("collects items in no column so the slices still sum to the total", () => {
    const slices = statusDistribution(
      [todo({ column_id: null }), todo({ column_id: "c-gone" })],
      COLUMNS,
    );

    const orphans = slices.find((slice) => slice.key === null);

    expect(orphans?.count).toBe(2);
    expect(slices.reduce((sum, slice) => sum + slice.count, 0)).toBe(2);
  });
});

describe("priorityDistribution", () => {
  it("lists all five levels in menu order with unset last", () => {
    const slices = priorityDistribution([]);

    expect(slices.map((slice) => slice.key)).toEqual([
      "highest",
      "high",
      "medium",
      "low",
      "lowest",
      null,
    ]);
  });

  it("counts unset as its own slice rather than dropping it", () => {
    const slices = priorityDistribution([
      todo({ priority: "high" }),
      todo({ priority: null }),
      todo({ priority: null }),
    ]);

    expect(slices.find((slice) => slice.key === "high")?.count).toBe(1);
    expect(slices.find((slice) => slice.key === null)?.count).toBe(2);
  });

  it("counts an unrecognised stored value as unset", () => {
    const slices = priorityDistribution([todo({ priority: "urgent" })]);

    expect(slices.find((slice) => slice.key === null)?.count).toBe(1);
  });
});

describe("typeDistribution", () => {
  it("lists every type even at zero", () => {
    const slices = typeDistribution([]);

    expect(slices.map((slice) => slice.key)).toEqual([
      "Task",
      "Bug",
      "Story",
      "Feature",
    ]);
  });

  it("counts by type and falls back to the default for anything unknown", () => {
    const slices = typeDistribution([
      todo({ type: "Bug" }),
      todo({ type: "Bug" }),
      todo({ type: "Epic" }),
    ]);

    expect(slices.find((slice) => slice.key === "Bug")?.count).toBe(2);
    // 'Epic' does not exist in this product; `toWorkType` resolves it to the
    // default rather than inventing a fifth bar.
    expect(slices.find((slice) => slice.key === "Task")?.count).toBe(1);
  });
});
