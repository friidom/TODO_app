import { describe, expect, it } from "vitest";

import type { ReorderMove } from "@/components/dnd/reorderDnd";
import type { WorkflowDraft } from "@/services/workflow/draft";

import {
  COLUMN_GROUP,
  STATUS_GROUP,
  columnOfLane,
  laneId,
  withReorderMove,
} from "./workflowMove";

function draft(): WorkflowDraft {
  const status = (id: string, column_id: string) => ({
    id,
    column_id,
    name: id,
    category: "todo" as const,
    is_hidden: false,
  });

  return {
    version: 1,
    columns: [
      { id: "c-a", title: "A" },
      { id: "c-b", title: "B" },
      { id: "c-empty", title: "Empty" },
    ],
    statuses: [
      status("s-a1", "c-a"),
      status("s-a2", "c-a"),
      status("s-b1", "c-b"),
      status("s-b2", "c-b"),
    ],
    transitions: [],
    migrations: [],
  };
}

function move(
  group: string,
  activeId: string,
  overId: string,
  side: ReorderMove["side"],
): ReorderMove {
  return {
    activeId,
    overId,
    side,
    data: {
      group,
      axis: group === COLUMN_GROUP ? "x" : "y",
      kind: "item",
    },
  };
}

const placement = (next: WorkflowDraft | null) =>
  next?.statuses.map((it) => `${it.column_id}/${it.id}`);

describe("laneId", () => {
  it("round-trips, and is never a column's own id", () => {
    expect(laneId("c-a")).not.toBe("c-a");
    expect(columnOfLane(laneId("c-a"))).toEqual({ columnId: "c-a" });
    expect(columnOfLane(laneId(null))).toEqual({ columnId: null });
    expect(columnOfLane("c-a")).toBeNull();
  });
});

describe("withReorderMove", () => {
  it("reorders the columns", () => {
    expect(
      withReorderMove(
        draft(),
        move(COLUMN_GROUP, "c-a", "c-empty", "after"),
      )?.columns.map((it) => it.id),
    ).toEqual(["c-b", "c-empty", "c-a"]);
  });

  it("moves a status inside its column", () => {
    expect(
      placement(
        withReorderMove(draft(), move(STATUS_GROUP, "s-a1", "s-a2", "after")),
      ),
    ).toEqual(["c-a/s-a2", "c-a/s-a1", "c-b/s-b1", "c-b/s-b2"]);
  });

  it("moves a status next to one in another column", () => {
    expect(
      placement(
        withReorderMove(draft(), move(STATUS_GROUP, "s-a1", "s-b2", "before")),
      ),
    ).toEqual(["c-a/s-a2", "c-b/s-b1", "c-b/s-a1", "c-b/s-b2"]);
  });

  it("drops a status into an empty lane", () => {
    expect(
      placement(
        withReorderMove(
          draft(),
          move(STATUS_GROUP, "s-b1", laneId("c-empty"), null),
        ),
      ),
    ).toEqual(["c-a/s-a1", "c-a/s-a2", "c-b/s-b2", "c-empty/s-b1"]);
  });

  it("is null for a move it cannot place", () => {
    expect(
      withReorderMove(draft(), move(STATUS_GROUP, "s-a1", "c-empty", null)),
    ).toBeNull();
    expect(
      withReorderMove(draft(), move(STATUS_GROUP, "s-a1", "s-gone", "before")),
    ).toBeNull();
    expect(
      withReorderMove(draft(), move("tabs", "s-a1", "s-a2", "before")),
    ).toBeNull();
  });
});
