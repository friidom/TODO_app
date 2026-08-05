import { describe, expect, it } from "vitest";

import { limitBreach } from "./limitBreach";

const column = (min: number | null, max: number | null) => ({
  title: "In Review",
  min_limit: min,
  max_limit: max,
});

describe("limitBreach", () => {
  it("never warns when no limits are set", () => {
    expect(limitBreach(column(null, null), 0)).toBe(null);
    expect(limitBreach(column(null, null), 999)).toBe(null);
  });

  it("reports being under the minimum", () => {
    expect(limitBreach(column(4, null), 3)).toBe(
      "3 work items in In Review. Minimum is 4.",
    );
  });

  it("reports being over the maximum", () => {
    expect(limitBreach(column(null, 5), 6)).toBe(
      "6 work items in In Review. Maximum is 5.",
    );
  });

  it("treats the boundaries as inclusive", () => {
    expect(limitBreach(column(4, 5), 4)).toBe(null);
    expect(limitBreach(column(4, 5), 5)).toBe(null);
  });

  it("treats zero as a real minimum, not as unset", () => {
    expect(limitBreach(column(0, null), 0)).toBe(null);
  });

  it("warns as soon as anything lands when the maximum is zero", () => {
    expect(limitBreach(column(null, 0), 1)).toBe(
      "1 work items in In Review. Maximum is 0.",
    );
  });

  it("reports the maximum when bad data breaches both", () => {
    expect(limitBreach(column(10, 2), 5)).toBe(
      "5 work items in In Review. Maximum is 2.",
    );
  });
});
