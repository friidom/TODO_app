import { describe, expect, it } from "vitest";

import { applyPinned, pinnedCount, pinnedItems } from "./pinned";

const item = (id: string, pinned_at: string | null = null) => ({
  id,
  pinned_at,
});

describe("pinnedItems", () => {
  it("keeps pinned items, newest pin first, at most five", () => {
    const items = [
      item("a", "2026-10-01"),
      item("b"),
      item("c", "2026-10-03"),
      ...["d", "e", "f", "g"].map((id, i) => item(id, `2026-09-0${i + 1}`)),
    ];

    expect(pinnedItems(items).map((it) => it.id)).toEqual([
      "c",
      "a",
      "g",
      "f",
      "e",
    ]);
    expect(pinnedCount(items)).toBe(6);
  });

  it("toggles one item and leaves the rest", () => {
    const items = [item("a"), item("b", "x")];
    const next = applyPinned(items, "a", true, "now");

    expect(next[0]!.pinned_at).toBe("now");
    expect(next[1]).toBe(items[1]);
    expect(applyPinned(next, "a", false, "now")[0]!.pinned_at).toBeNull();
  });
});
