import { describe, expect, it } from "vitest";

import { describeActivity, type ActivityContext } from "./activityText";
import type { Activity } from "@/types/data";

const CTX: ActivityContext = {
  keyPrefix: "KAN",
  names: { "user-a": "Alice", "user-b": "Bob" },
  liveTaskIds: new Set(["todo-1"]),
};

function entry(over: Partial<Activity>): Activity {
  return {
    id: "act-1",
    board_id: "board-1",
    actor_id: "user-a",
    entity_type: "todo",
    entity_id: "todo-1",
    action: "created",
    payload: {},
    created_at: "2026-08-15T10:00:00Z",
    ...over,
  };
}

describe("describeActivity — work items", () => {
  it("names an item by its key", () => {
    const line = describeActivity(
      entry({ action: "created", payload: { board_key: 12, title: "Fix it" } }),
      CTX,
    );

    expect(line.text).toBe("created KAN-12");
    expect(line.taskId).toBe("todo-1");
  });

  it("falls back to the title when the key was never allocated", () => {
    // `board_key` comes from a BEFORE INSERT trigger, so a card deleted while
    // its insert was still in flight has a title and no key.
    const line = describeActivity(
      entry({ action: "created", payload: { title: "Fix it" } }),
      CTX,
    );

    expect(line.text).toBe("created Fix it");
  });

  it("falls back again when the payload has neither", () => {
    expect(describeActivity(entry({ action: "created" }), CTX).text).toBe(
      "created a work item",
    );
  });

  it("reads both column titles out of the snapshot", () => {
    const line = describeActivity(
      entry({
        action: "moved",
        payload: { board_key: 3, from: "Todo", to: "In Progress" },
      }),
      CTX,
    );

    expect(line.text).toBe("moved KAN-3 from Todo to In Progress");
  });

  it("still reads when the source column has been deleted", () => {
    // The trigger snapshots the title, but a card that was in no column at all
    // snapshots null — the sentence has to survive that too.
    const line = describeActivity(
      entry({
        action: "moved",
        payload: { board_key: 3, from: null, to: "Done" },
      }),
      CTX,
    );

    expect(line.text).toBe("moved KAN-3 to Done");
  });

  it("resolves an assignee through the roster", () => {
    const line = describeActivity(
      entry({ action: "assigned", payload: { board_key: 3, to: "user-b" } }),
      CTX,
    );

    expect(line.text).toBe("assigned KAN-3 to Bob");
  });

  it("names someone off the roster as a former member", () => {
    const line = describeActivity(
      entry({ action: "assigned", payload: { board_key: 3, to: "user-gone" } }),
      CTX,
    );

    expect(line.text).toBe("assigned KAN-3 to a former member");
  });

  it("distinguishes unassigning from assigning", () => {
    const line = describeActivity(
      entry({
        action: "assigned",
        payload: { board_key: 3, from: "user-a", to: null },
      }),
      CTX,
    );

    expect(line.text).toBe("unassigned KAN-3");
  });

  it("shows the new title on a rename", () => {
    const line = describeActivity(
      entry({
        action: "retitled",
        payload: { board_key: 3, from: "Old", to: "New" },
      }),
      CTX,
    );

    expect(line.text).toBe("renamed KAN-3 to “New”");
  });

  it("carries the destination status as the chip", () => {
    // The half of an entry people scan for: the sentence says what happened,
    // the chip says where it landed.
    const line = describeActivity(
      entry({
        action: "moved",
        payload: { board_key: 3, from: "Todo", to: "In Progress" },
      }),
      CTX,
    );

    expect(line.detail).toEqual({ label: "Status", value: "In Progress" });
  });

  it("gives create and rename no chip, because they land nowhere", () => {
    expect(
      describeActivity(entry({ action: "created" }), CTX).detail,
    ).toBeNull();

    expect(
      describeActivity(
        entry({ action: "retitled", payload: { from: "Old", to: "New" } }),
        CTX,
      ).detail,
    ).toBeNull();
  });

  it("never links a deleted item", () => {
    const line = describeActivity(
      entry({ action: "deleted", payload: { board_key: 3 } }),
      CTX,
    );

    expect(line.text).toBe("deleted KAN-3");
    expect(line.taskId).toBeNull();
  });

  it("does not link an item that is no longer on the board", () => {
    // The rule that keeps a feed row from opening a "Task not found" modal.
    const line = describeActivity(
      entry({
        entity_id: "todo-gone",
        action: "moved",
        payload: { board_key: 9 },
      }),
      CTX,
    );

    expect(line.taskId).toBeNull();
  });

  it("uses the board's own prefix", () => {
    const line = describeActivity(
      entry({ action: "created", payload: { board_key: 4 } }),
      { ...CTX, keyPrefix: "OPS" },
    );

    expect(line.text).toBe("created OPS-4");
  });
});

describe("describeActivity — field changes", () => {
  it("spells a priority the way the rest of the product does", () => {
    // Through `PRIORITIES`, so the feed cannot call `highest` anything the
    // sort, the filter and the card chip do not.
    const line = describeActivity(
      entry({
        action: "priority_changed",
        payload: { board_key: 23, from: null, to: "highest" },
      }),
      CTX,
    );

    expect(line.text).toBe("changed the priority of KAN-23");
    expect(line.detail).toEqual({
      label: "Priority",
      value: "Highest",
      tone: "text-status-red",
    });
    expect(line.taskId).toBe("todo-1");
  });

  it("reads a cleared priority as None rather than as a blank", () => {
    const line = describeActivity(
      entry({
        action: "priority_changed",
        payload: { board_key: 23, from: "high", to: null },
      }),
      CTX,
    );

    expect(line.detail).toEqual({ label: "Priority", value: "None" });
  });

  it("renders a priority a later migration added, uncoloured", () => {
    const line = describeActivity(
      entry({ action: "priority_changed", payload: { to: "blocker" } }),
      CTX,
    );

    expect(line.detail).toEqual({ label: "Priority", value: "blocker" });
  });

  it("formats a due date through the one date formatter", () => {
    const line = describeActivity(
      entry({
        action: "due_changed",
        payload: { board_key: 23, from: null, to: "2026-08-20" },
      }),
      CTX,
    );

    expect(line.text).toBe("rescheduled KAN-23");
    expect(line.detail?.label).toBe("Due");
    expect(line.detail?.value).toContain("20");
  });

  it("distinguishes clearing a due date from setting one", () => {
    const line = describeActivity(
      entry({
        action: "due_changed",
        payload: { board_key: 23, from: "2026-08-20", to: null },
      }),
      CTX,
    );

    expect(line.text).toBe("cleared the due date on KAN-23");
    expect(line.detail).toEqual({ label: "Due", value: "None" });
  });

  it("reads a type change", () => {
    const line = describeActivity(
      entry({
        action: "type_changed",
        payload: { board_key: 23, from: "Task", to: "Bug" },
      }),
      CTX,
    );

    expect(line.text).toBe("changed the type of KAN-23");
    expect(line.detail).toEqual({ label: "Type", value: "Bug" });
  });

  it("reads a description change with no value in the detail (M25)", () => {
    // The migration's own rule: description carries no from/to, so there is
    // nothing to put in a chip even though the sentence is a real event.
    const line = describeActivity(
      entry({
        action: "description_changed",
        payload: { board_key: 23 },
      }),
      CTX,
    );

    expect(line.text).toBe("changed the description of KAN-23");
    expect(line.detail).toBeNull();
  });

  it("reads an estimate change (M25)", () => {
    const line = describeActivity(
      entry({
        action: "estimate_changed",
        payload: { board_key: 23, from: null, to: 5 },
      }),
      CTX,
    );

    expect(line.text).toBe("changed the estimate of KAN-23");
    expect(line.detail).toEqual({ label: "Estimate", value: "5" });
  });

  it("reads an estimate cleared to null as None (M25)", () => {
    // The null-vs-zero distinction M24-A's constraint protects has to survive
    // the trip through the payload too: a cleared estimate reads "None", not
    // "0" and not a blank chip.
    const line = describeActivity(
      entry({
        action: "estimate_changed",
        payload: { board_key: 23, from: 5, to: null },
      }),
      CTX,
    );

    expect(line.detail).toEqual({ label: "Estimate", value: "None" });
  });

  it("reads a written zero estimate as 0, not as None (M25)", () => {
    const line = describeActivity(
      entry({
        action: "estimate_changed",
        payload: { board_key: 23, from: null, to: 0 },
      }),
      CTX,
    );

    expect(line.detail).toEqual({ label: "Estimate", value: "0" });
  });
});

describe("describeActivity — columns", () => {
  it("names a created column", () => {
    const line = describeActivity(
      entry({
        entity_type: "column",
        entity_id: "col-1",
        action: "created",
        payload: { title: "Backlog" },
      }),
      CTX,
    );

    expect(line.text).toBe("created the column Backlog");
    expect(line.taskId).toBeNull();
  });

  it("reads both names on a rename", () => {
    const line = describeActivity(
      entry({
        entity_type: "column",
        entity_id: "col-1",
        action: "renamed",
        payload: { from: "Backlog", to: "Icebox" },
      }),
      CTX,
    );

    expect(line.text).toBe("renamed the column Backlog to Icebox");
  });
});

describe("describeActivity — membership", () => {
  it("names the member and the role", () => {
    const line = describeActivity(
      entry({
        entity_type: "member",
        entity_id: "user-b",
        action: "added",
        payload: { role: "editor" },
      }),
      CTX,
    );

    expect(line.text).toBe("added Bob as editor");
  });

  it("reads a role change", () => {
    const line = describeActivity(
      entry({
        entity_type: "member",
        entity_id: "user-b",
        action: "role_changed",
        payload: { from: "viewer", to: "admin" },
      }),
      CTX,
    );

    expect(line.text).toBe("made Bob admin");
  });

  it("still names someone who has been removed from the roster", () => {
    // The removal entry is written by the same trigger that removes them, so
    // by the time anyone reads it the roster no longer lists them. This is the
    // case M7-05's "must still explain itself" rule is really about.
    const line = describeActivity(
      entry({
        entity_type: "member",
        entity_id: "user-gone",
        action: "removed",
      }),
      CTX,
    );

    expect(line.text).toBe("removed a former member");
  });
});

describe("describeActivity — unknown events", () => {
  it("renders a true sentence rather than throwing", () => {
    // Reachable if a later migration adds an event this build predates.
    const line = describeActivity(
      entry({ entity_type: "todo", action: "estimated" }),
      CTX,
    );

    expect(line.text).toBe("changed something");
  });

  it("tolerates a payload that is not an object", () => {
    const line = describeActivity(
      entry({ action: "created", payload: "unexpected" }),
      CTX,
    );

    expect(line.text).toBe("created a work item");
  });
});

describe("describeActivity — subtasks (M27)", () => {
  it("reads a subtask added, naming the child", () => {
    const line = describeActivity(
      entry({ action: "subtask_added", payload: { board_key: 78 } }),
      CTX,
    );

    expect(line.text).toBe("added subtask KAN-78");
    expect(line.detail).toBeNull();
  });

  it("reads a subtask removed", () => {
    const line = describeActivity(
      entry({ action: "subtask_removed", payload: { board_key: 78 } }),
      CTX,
    );

    expect(line.text).toBe("removed subtask KAN-78");
  });

  it("reads a work item becoming a subtask", () => {
    const line = describeActivity(
      entry({
        action: "parent_changed",
        payload: { board_key: 23, from: null, to: "task-1" },
      }),
      CTX,
    );

    expect(line.text).toBe("made KAN-23 a subtask");
  });

  it("reads a subtask promoted back to top level", () => {
    const line = describeActivity(
      entry({
        action: "parent_changed",
        payload: { board_key: 23, from: "task-1", to: null },
      }),
      CTX,
    );

    expect(line.text).toBe("made KAN-23 a top-level work item");
  });
});
