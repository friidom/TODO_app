import { describe, expect, it } from "vitest";

import { filterOptions, matchOptions } from "./filterOptions";
import type { BoardMember } from "../members/membersApi";
import type { IColumn } from "../../types/data";

const member = (
  id: string,
  full_name: string | null,
  username = "",
): BoardMember =>
  ({
    id,
    full_name,
    username,
    avatar_url: null,
    role: "editor",
    joined_at: "2026-01-01T00:00:00Z",
  }) as BoardMember;

const column = (id: string, title: string, rank: number): IColumn =>
  ({ id, title, rank, position: null, category: "todo" }) as IColumn;

const ctx = {
  columns: [
    column("c2", "Doing", 2048),
    column("c1", "To do", 1024),
    column("c3", "Done", 3072),
  ],
  members: [
    member("u1", "Ada Lovelace"),
    member("u2", "Grace Hopper"),
    member("u3", null, "katherine"),
  ],
  currentUserId: "u1",
};

const values = (options: { value: string }[]) => options.map((o) => o.value);
const labels = (options: { label: string }[]) => options.map((o) => o.label);

describe("filterOptions", () => {
  describe("assignee", () => {
    it("offers the two pseudo-values first, then the roster", () => {
      // "Assigned to me" and "Unassigned" are what an assignee filter is asked
      // for most; burying them under a roster would be this panel's own version
      // of the problem it exists to fix.
      expect(values(filterOptions("assignee", ctx))).toEqual([
        "me",
        "none",
        "u2",
        "u3",
      ]);
    });

    it("omits the signed-in user, who is already 'Assigned to me'", () => {
      // Two checkboxes for one person would have to be kept in agreement, and a
      // shared URL is meant to mean "assigned to whoever opened it".
      expect(values(filterOptions("assignee", ctx))).not.toContain("u1");
    });

    it("names a member the same way the rest of the app does", () => {
      // Falls through `memberName`, so a member with no full name is labelled
      // by username rather than by a blank row.
      expect(labels(filterOptions("assignee", ctx))).toEqual([
        "Assigned to me",
        "Unassigned",
        "Grace Hopper",
        "katherine",
      ]);
    });

    it("still offers the pseudo-values on a board with no roster yet", () => {
      expect(
        values(filterOptions("assignee", { ...ctx, members: [] })),
      ).toEqual(["me", "none"]);
    });
  });

  describe("status", () => {
    it("lists columns in board order, not the order they arrived in", () => {
      expect(labels(filterOptions("status", ctx))).toEqual([
        "To do",
        "Doing",
        "Done",
      ]);
    });

    it("labels an untitled column rather than rendering a blank row", () => {
      const options = filterOptions("status", {
        ...ctx,
        columns: [column("c0", "", 1024)],
      });

      expect(labels(options)).toEqual(["Untitled"]);
    });
  });

  it("offers every work type", () => {
    expect(values(filterOptions("type", ctx))).toEqual([
      "Task",
      "Bug",
      "Story",
      "Feature",
    ]);
  });

  it("offers every priority plus 'no priority'", () => {
    // The unset case is a real answer — a board where nothing is prioritised is
    // exactly when someone filters for it.
    const options = filterOptions("priority", ctx);

    expect(values(options)).toEqual([
      "highest",
      "high",
      "medium",
      "low",
      "lowest",
      "none",
    ]);
    expect(labels(options).at(-1)).toBe("No priority");
  });

  it("offers the four due-date buckets with their shared labels", () => {
    const options = filterOptions("due", ctx);

    expect(values(options)).toEqual(["none", "overdue", "today", "upcoming"]);
    expect(labels(options)).toContain("Overdue");
  });
});

describe("matchOptions", () => {
  const options = filterOptions("assignee", ctx);

  it("returns the same array when nothing is typed", () => {
    // Identity, not a copy — the rule `filterTodos` and `searchTodos` follow.
    expect(matchOptions(options, "")).toBe(options);
    expect(matchOptions(options, "   ")).toBe(options);
  });

  it("matches a label case-insensitively, anywhere in it", () => {
    expect(labels(matchOptions(options, "grace"))).toEqual(["Grace Hopper"]);
    expect(labels(matchOptions(options, "HOPPER"))).toEqual(["Grace Hopper"]);
    expect(labels(matchOptions(options, "ass"))).toEqual([
      "Assigned to me",
      "Unassigned",
    ]);
  });

  it("collapses runs of whitespace, like the board's own search", () => {
    // Two search boxes on one screen behaving differently is worse than either
    // behaving imperfectly.
    expect(labels(matchOptions(options, "grace  hopper"))).toEqual([
      "Grace Hopper",
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(matchOptions(options, "zzz")).toEqual([]);
  });
});
