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
