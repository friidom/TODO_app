import { describe, expect, it } from "vitest";

import { DEFAULT_KEY_PREFIX, taskKey } from "./taskKey";

describe("taskKey", () => {
  it("joins the board's prefix to the work item's counter", () => {
    expect(taskKey("KAN", 12)).toBe("KAN-12");
  });

  it("uses the prefix it is given, not a hardcoded one", () => {
    expect(taskKey("OPS", 1)).toBe("OPS-1");
    expect(taskKey("KAN", 1)).not.toBe(taskKey("OPS", 1));
  });

  it("has no key while the insert is in flight", () => {
    // board_key is trigger-assigned, so an optimistic row is null until the server answers
    expect(taskKey("KAN", null)).toBeNull();
  });

  it("keeps the zero key, which is a value and not an absence", () => {
    expect(taskKey("KAN", 0)).toBe("KAN-0");
  });

  it("defaults to the prefix the column defaults to", () => {
    expect(DEFAULT_KEY_PREFIX).toBe("KAN");
  });
});
