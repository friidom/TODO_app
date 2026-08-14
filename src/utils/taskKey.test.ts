import { describe, expect, it } from "vitest";

import { DEFAULT_KEY_PREFIX, taskKey } from "./taskKey";

describe("taskKey", () => {
  it("joins the board's prefix to the work item's counter", () => {
    expect(taskKey("KAN", 12)).toBe("KAN-12");
  });

  it("uses the prefix it is given, not a hardcoded one", () => {
    // The whole point of M14: before it, every board rendered KAN-1, so a
    // second board's first card was indistinguishable from the first board's.
    expect(taskKey("OPS", 1)).toBe("OPS-1");
    expect(taskKey("KAN", 1)).not.toBe(taskKey("OPS", 1));
  });

  it("has no key while the insert is in flight", () => {
    // `board_key` is assigned by a BEFORE INSERT trigger (M2-21), so an
    // optimistic row carries null until the server answers. Returning null
    // rather than "KAN-null" is what lets the three render sites hide the chip
    // for exactly that moment.
    expect(taskKey("KAN", null)).toBeNull();
  });

  it("keeps the zero key, which is a value and not an absence", () => {
    // Not reachable today — next_key starts at 1 — but `0` is falsy and this
    // is the classic place that turns into a missing chip.
    expect(taskKey("KAN", 0)).toBe("KAN-0");
  });

  it("defaults to the prefix the column defaults to", () => {
    // Kept in step with `boards.key_prefix default 'KAN'`; if the migration
    // changes, this fails rather than the app quietly disagreeing with the
    // database about what an unconfigured board is called.
    expect(DEFAULT_KEY_PREFIX).toBe("KAN");
  });
});
