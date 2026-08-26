import { describe, expect, it } from "vitest";

import { describeHistoryChange } from "./historyText";
import type { Activity } from "@/types/data";

const NAMES = { "user-a": "Alice", "user-b": "Bob" };

function entry(
  action: string,
  payload: Record<string, string | number | null> = {},
): Activity {
  return {
    id: "act-1",
    board_id: "board-1",
    actor_id: "user-a",
    entity_type: "todo",
    entity_id: "todo-1",
    action,
    payload,
    created_at: "2026-08-26T10:00:00Z",
  };
}

describe("describeHistoryChange — created", () => {
  it("has no field and no chip", () => {
    const change = describeHistoryChange(entry("created"), NAMES);

    expect(change).toEqual({
      verb: "created this issue",
      field: null,
      from: null,
      to: null,
    });
  });
});

describe("describeHistoryChange — moved (Status)", () => {
  it("reads the column titles as the chip pair", () => {
    const change = describeHistoryChange(
      entry("moved", { from: "To Do", to: "In Progress" }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "changed",
      field: "Status",
      from: "To Do",
      to: "In Progress",
    });
  });

  it("falls back to None when a column snapshot is missing", () => {
    const change = describeHistoryChange(entry("moved", {}), NAMES);

    expect(change?.from).toBe("None");
    expect(change?.to).toBe("None");
  });
});

describe("describeHistoryChange — assigned (Assignee)", () => {
  it("resolves both ids through the roster", () => {
    const change = describeHistoryChange(
      entry("assigned", { from: "user-a", to: "user-b" }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "changed",
      field: "Assignee",
      from: "Alice",
      to: "Bob",
    });
  });

  it("reads a null id as Unassigned", () => {
    const change = describeHistoryChange(
      entry("assigned", { from: null, to: "user-a" }),
      NAMES,
    );

    expect(change?.from).toBe("Unassigned");
    expect(change?.to).toBe("Alice");
  });

  it("reads an id the roster no longer lists as Former member", () => {
    const change = describeHistoryChange(
      entry("assigned", { from: "user-a", to: "user-gone" }),
      NAMES,
    );

    expect(change?.to).toBe("Former member");
  });
});

describe("describeHistoryChange — retitled (Title)", () => {
  it("reads both titles", () => {
    const change = describeHistoryChange(
      entry("retitled", { from: "Old title", to: "New title" }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "changed",
      field: "Title",
      from: "Old title",
      to: "New title",
    });
  });

  it("truncates a title longer than 40 characters", () => {
    const long = "x".repeat(60);
    const change = describeHistoryChange(
      entry("retitled", { from: long, to: "short" }),
      NAMES,
    );

    expect(change?.from).toHaveLength(40);
    expect(change?.from?.endsWith("…")).toBe(true);
  });

  it("falls back to Untitled for a null title", () => {
    const change = describeHistoryChange(
      entry("retitled", { from: null, to: "New title" }),
      NAMES,
    );

    expect(change?.from).toBe("Untitled");
  });
});

describe("describeHistoryChange — priority_changed (Priority)", () => {
  it("resolves the stored value to its product label", () => {
    const change = describeHistoryChange(
      entry("priority_changed", { from: "medium", to: "highest" }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "changed",
      field: "Priority",
      from: "Medium",
      to: "Highest",
    });
  });

  it("reads a null priority as None", () => {
    const change = describeHistoryChange(
      entry("priority_changed", { from: null, to: "high" }),
      NAMES,
    );

    expect(change?.from).toBe("None");
  });
});

describe("describeHistoryChange — due_changed (Due date)", () => {
  it("formats both calendar days", () => {
    const change = describeHistoryChange(
      entry("due_changed", { from: "2026-08-01", to: "2026-08-20" }),
      NAMES,
    );

    expect(change?.field).toBe("Due date");
    expect(change?.from).not.toBe("2026-08-01"); // formatted, not raw
    expect(change?.to).not.toBeNull();
  });

  it("reads a cleared due date as None", () => {
    const change = describeHistoryChange(
      entry("due_changed", { from: "2026-08-01", to: null }),
      NAMES,
    );

    expect(change?.to).toBe("None");
  });
});

describe("describeHistoryChange — type_changed (Work type)", () => {
  it("reads both stored type values", () => {
    const change = describeHistoryChange(
      entry("type_changed", { from: "Task", to: "Bug" }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "changed",
      field: "Work type",
      from: "Task",
      to: "Bug",
    });
  });
});

describe("describeHistoryChange — description_changed", () => {
  it("has a field but no chip", () => {
    // The migration's own rule: no from/to is ever stored for this action.
    const change = describeHistoryChange(
      entry("description_changed", {}),
      NAMES,
    );

    expect(change).toEqual({
      verb: "changed",
      field: "Description",
      from: null,
      to: null,
    });
  });
});

describe("describeHistoryChange — estimate_changed (Story point estimate)", () => {
  it("reads a plain numeric change", () => {
    const change = describeHistoryChange(
      entry("estimate_changed", { from: 3, to: 5 }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "changed",
      field: "Story point estimate",
      from: "3",
      to: "5",
    });
  });

  it("reads an unset estimate as None, not as 0", () => {
    const change = describeHistoryChange(
      entry("estimate_changed", { from: null, to: 3 }),
      NAMES,
    );

    expect(change?.from).toBe("None");
  });

  it("reads a written zero as 0, distinct from None", () => {
    // The exact distinction M24-A's constraint and cache widening exist to
    // preserve, carried through to how history renders it.
    const change = describeHistoryChange(
      entry("estimate_changed", { from: null, to: 0 }),
      NAMES,
    );

    expect(change?.to).toBe("0");
    expect(change?.to).not.toBe("None");
  });
});

describe("describeHistoryChange — unrenderable actions", () => {
  it("returns null for deleted", () => {
    expect(describeHistoryChange(entry("deleted"), NAMES)).toBeNull();
  });

  it("returns null for an action this build does not recognise", () => {
    expect(describeHistoryChange(entry("something_new"), NAMES)).toBeNull();
  });
});

describe("describeHistoryChange — subtasks (M27)", () => {
  it("names an added subtask by its key", () => {
    // This row lives in the PARENT's history: `entity_id` is the parent, and
    // the payload describes the child.
    const change = describeHistoryChange(
      entry("subtask_added", { board_key: 78, title: "123" }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "added subtask",
      field: "#78",
      from: null,
      to: null,
    });
  });

  it("names a removed subtask the same way", () => {
    const change = describeHistoryChange(
      entry("subtask_removed", { board_key: 78, title: "123" }),
      NAMES,
    );

    expect(change?.verb).toBe("removed subtask");
    expect(change?.field).toBe("#78");
  });

  it("falls back to the title for a child that never got a key", () => {
    // `board_key` is allocated by a trigger, so a subtask deleted while its
    // insert was still in flight has a title and no key.
    const change = describeHistoryChange(
      entry("subtask_added", { title: "Write the migration" }),
      NAMES,
    );

    expect(change?.field).toBe("Write the migration");
  });

  it("reads becoming a subtask", () => {
    const change = describeHistoryChange(
      entry("parent_changed", { from: null, to: "task-1" }),
      NAMES,
    );

    expect(change).toEqual({
      verb: "made this a subtask",
      field: null,
      from: null,
      to: null,
    });
  });

  it("reads being promoted back to a top-level work item", () => {
    const change = describeHistoryChange(
      entry("parent_changed", { from: "task-1", to: null }),
      NAMES,
    );

    expect(change?.verb).toBe("made this a top-level work item");
    // No chip: both sides are raw uuids this renderer cannot resolve into
    // keys, and the sentence already carries the whole fact.
    expect(change?.from).toBeNull();
    expect(change?.to).toBeNull();
  });
});
