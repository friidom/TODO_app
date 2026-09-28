import { describe, expect, it } from "vitest";

import { filterOptions, matchOptions } from "./filterOptions";
import type { BoardMember } from "../members/membersApi";
import type { IStatus } from "../../types/data";

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

const status = (id: string, name: string, is_hidden = false): IStatus =>
  ({
    id,
    name,
    is_hidden,
    category: "todo",
    column_id: `col-${id}`,
  }) as IStatus;

// Board order, as the workflow model hands statuses out.
const ctx = {
  statuses: [
    status("s1", "To do"),
    status("s2", "Doing"),
    status("s3", "Done"),
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
      expect(values(filterOptions("assignee", ctx))).toEqual([
        "me",
        "none",
        "u2",
        "u3",
      ]);
    });

    it("omits the signed-in user, who is already 'Assigned to me'", () => {
      expect(values(filterOptions("assignee", ctx))).not.toContain("u1");
    });

    it("names a member the same way the rest of the app does", () => {
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
    it("lists statuses in board order, by id and name", () => {
      expect(values(filterOptions("status", ctx))).toEqual(["s1", "s2", "s3"]);
      expect(labels(filterOptions("status", ctx))).toEqual([
        "To do",
        "Doing",
        "Done",
      ]);
    });

    // Retired from new work, but the cards already in it must stay findable.
    it("still offers a hidden status", () => {
      const options = filterOptions("status", {
        ...ctx,
        statuses: [...ctx.statuses, status("s4", "Parked", true)],
      });

      expect(values(options)).toContain("s4");
    });
  });

  it("offers every work type", () => {
    expect(values(filterOptions("type", ctx))).toEqual([
      "Task",
      "Bug",
      "Story",
      "Feature",
      "Epic",
    ]);
  });

  it("offers every priority plus 'no priority'", () => {
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
    // identity, not a copy
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
    expect(labels(matchOptions(options, "grace  hopper"))).toEqual([
      "Grace Hopper",
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(matchOptions(options, "zzz")).toEqual([]);
  });
});
