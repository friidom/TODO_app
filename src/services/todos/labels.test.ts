import { describe, expect, it } from "vitest";

import {
  hasLabel,
  labelCatalog,
  labelTone,
  normalizeLabel,
  withLabel,
  withoutLabel,
} from "./labels";

describe("labels", () => {
  it("normalises spacing", () => {
    expect(normalizeLabel("  needs \t review ")).toBe("needs review");
  });

  it("compares without case", () => {
    expect(hasLabel(["Bug"], "bug")).toBe(true);
    expect(withLabel(["Bug"], "BUG")).toEqual(["Bug"]);
    expect(withLabel(["Bug"], "ui")).toEqual(["Bug", "ui"]);
    expect(withoutLabel(["Bug", "ui"], "bug")).toEqual(["ui"]);
  });

  it("builds a catalogue by use, keeping the first spelling", () => {
    const catalog = labelCatalog([
      { labels: ["ui", "Bug"] },
      { labels: ["bug"] },
      { labels: null },
      {},
      { labels: ["api"] },
    ]);

    expect(catalog).toEqual([
      { name: "Bug", count: 2 },
      { name: "api", count: 1 },
      { name: "ui", count: 1 },
    ]);
  });

  it("gives one label the same tone in any case", () => {
    expect(labelTone("Bug")).toBe(labelTone("bug"));
  });
});
