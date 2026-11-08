import { describe, expect, it } from "vitest";

import { attentionItems } from "./attention";
import type { AgingBucket } from "./types";

const bucket = (from_days: number, count: number): AgingBucket => ({
  key: String(from_days),
  label: String(from_days),
  from_days,
  to_days: null,
  count,
});

describe("attentionItems", () => {
  it("warns when one superadmin is all that stands between Veylo and no admin", () => {
    expect(attentionItems(1, []).map((item) => item.key)).toEqual([
      "single_superadmin",
    ]);
    expect(attentionItems(2, [])).toEqual([]);
  });

  it("says nothing about a count it does not have yet", () => {
    expect(attentionItems(undefined, undefined)).toEqual([]);
  });

  it("counts only work in progress for 30 days or more, out of all of it", () => {
    const aging = [bucket(0, 11), bucket(15, 53), bucket(30, 216)];

    expect(attentionItems(2, aging)).toEqual([
      { key: "stale_work", count: 216, to: "/admin/flow", of: 280 },
    ]);
    expect(attentionItems(2, [bucket(30, 0)])).toEqual([]);
  });
});
