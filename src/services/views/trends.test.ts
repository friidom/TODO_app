import { describe, expect, it } from "vitest";

import { activityTrend, trendPeak } from "./trends";
import type { Todo } from "@/types/data";
import { todayISO } from "@/utils/dueDate";

// midday UTC so no real timezone offset moves a fixture onto a different date
const NOW = new Date("2026-08-15T12:00:00Z");

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
    created_at: "2026-08-14T12:00:00Z",
    updated_at: null,
    ...over,
  } as Todo;
}

const bucket = (points: ReturnType<typeof activityTrend>, iso: string) =>
  points.find((point) => point.day === todayISO(new Date(iso)));

const sum = (
  points: ReturnType<typeof activityTrend>,
  key: "created" | "updated",
) => points.reduce((total, point) => total + point[key], 0);

describe("activityTrend", () => {
  it("always returns one point per day, oldest first, ending today", () => {
    const points = activityTrend([], NOW, 7);

    expect(points).toHaveLength(7);
    expect(points.at(-1)?.day).toBe(todayISO(NOW));
    expect(points.every((p) => p.created === 0 && p.updated === 0)).toBe(true);
  });

  it("counts each item on the local day it was created", () => {
    const older = "2026-08-11T12:00:00Z";
    const newer = "2026-08-14T12:00:00Z";

    const points = activityTrend(
      [
        todo({ created_at: newer }),
        todo({ created_at: newer }),
        todo({ created_at: older }),
      ],
      NOW,
      7,
    );

    expect(bucket(points, newer)?.created).toBe(2);
    expect(bucket(points, older)?.created).toBe(1);
    expect(sum(points, "created")).toBe(3);
  });

  it("does NOT count a never-edited row as updated", () => {
    const at = "2026-08-13T12:00:00Z";

    const points = activityTrend(
      [
        todo({ created_at: at, updated_at: null }),
        todo({ created_at: at, updated_at: at }),
      ],
      NOW,
      7,
    );

    expect(sum(points, "created")).toBe(2);
    expect(sum(points, "updated")).toBe(0);
  });

  it("counts a real edit on the day of the edit, not the day of creation", () => {
    const created = "2026-08-11T12:00:00Z";
    const edited = "2026-08-14T12:00:00Z";

    const points = activityTrend(
      [todo({ created_at: created, updated_at: edited })],
      NOW,
      7,
    );

    expect(bucket(points, created)?.created).toBe(1);
    expect(bucket(points, created)?.updated).toBe(0);
    expect(bucket(points, edited)?.created).toBe(0);
    expect(bucket(points, edited)?.updated).toBe(1);
  });

  it("counts an item once per series even when both fall in the window", () => {
    const points = activityTrend(
      [
        todo({
          created_at: "2026-08-12T12:00:00Z",
          updated_at: "2026-08-13T12:00:00Z",
        }),
      ],
      NOW,
      7,
    );

    expect(sum(points, "created")).toBe(1);
    expect(sum(points, "updated")).toBe(1);
  });

  it("drops an edit older than the window while keeping a creation inside it", () => {
    const points = activityTrend(
      [
        todo({
          created_at: "2026-08-14T12:00:00Z",
          updated_at: "2026-08-14T18:00:00Z",
        }),
        todo({ created_at: "2026-01-01T12:00:00Z", updated_at: null }),
      ],
      NOW,
      7,
    );

    expect(sum(points, "created")).toBe(1);
    expect(sum(points, "updated")).toBe(1);
  });

  it("survives unparseable timestamps rather than charting NaN", () => {
    const points = activityTrend(
      [
        todo({ created_at: "not a date", updated_at: "also not a date" }),
        todo({ created_at: "not a date", updated_at: "2026-08-14T12:00:00Z" }),
      ],
      NOW,
      7,
    );

    expect(sum(points, "created")).toBe(0);
    expect(sum(points, "updated")).toBe(0);
  });
});

describe("trendPeak", () => {
  it("is the largest value across BOTH series, so they share one scale", () => {
    const points = [
      { day: "a", created: 3, updated: 9 },
      { day: "b", created: 7, updated: 1 },
    ];

    expect(trendPeak(points)).toBe(9);
  });

  it("never drops below 1, so a quiet week is a flat line and not a divide by zero", () => {
    expect(trendPeak([{ day: "a", created: 0, updated: 0 }])).toBe(1);
    expect(trendPeak([])).toBe(1);
  });
});
