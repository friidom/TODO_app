import { describe, expect, it } from "vitest";

import { taskKey } from "./taskKey";

describe("taskKey", () => {
  it("joins the board's prefix to the work item's counter", () => {
    expect(taskKey("MNH", 12)).toBe("MNH-12");
  });

  it("uses the prefix it is given, not a hardcoded one", () => {
    expect(taskKey("OPS", 1)).toBe("OPS-1");
    expect(taskKey("MNH", 1)).not.toBe(taskKey("OPS", 1));
  });

  it("has no key while the insert is in flight", () => {
    // board_key is trigger-assigned, so an optimistic row is null until the server answers
    expect(taskKey("MNH", null)).toBeNull();
  });

  it("has no key while the board's prefix is unknown", () => {
    expect(taskKey("", 12)).toBeNull();
  });

  it("keeps the zero key, which is a value and not an absence", () => {
    expect(taskKey("MNH", 0)).toBe("MNH-0");
  });
});
