import { describe, expect, it } from "vitest";

import { descriptionChanged, descriptionValue, titleValue } from "./taskDraft";

describe("descriptionValue", () => {
  it("clears on empty and on whitespace alone", () => {
    // One representation of "no description" in the database, not several.
    expect(descriptionValue("")).toBeNull();
    expect(descriptionValue("   ")).toBeNull();
    expect(descriptionValue("\n\t ")).toBeNull();
  });

  it("stores real content exactly as typed", () => {
    // Not trimmed: the trailing newline under a list is the author's.
    expect(descriptionValue("Steps:\n1. go\n")).toBe("Steps:\n1. go\n");
    expect(descriptionValue("  indented")).toBe("  indented");
  });
});

describe("descriptionChanged", () => {
  it("treats null and blank as the same absence", () => {
    expect(descriptionChanged("", null)).toBe(false);
    expect(descriptionChanged("   ", null)).toBe(false);
  });

  it("sees a first description, an edit and a clear", () => {
    expect(descriptionChanged("new", null)).toBe(true);
    expect(descriptionChanged("edited", "original")).toBe(true);
    expect(descriptionChanged("", "original")).toBe(true);
  });

  it("does not write the same value back", () => {
    expect(descriptionChanged("same", "same")).toBe(false);
  });
});

describe("titleValue", () => {
  it("refuses to blank a title, unlike a description", () => {
    // `todos.title` is the card's only label, so empty reverts rather than
    // clearing — the behaviour the card's inline rename already has.
    expect(titleValue("", "Ship it")).toBeNull();
    expect(titleValue("   ", "Ship it")).toBeNull();
  });

  it("returns nothing to write when unchanged", () => {
    expect(titleValue("Ship it", "Ship it")).toBeNull();
    // Trimmed before comparing, so padding alone is not an edit.
    expect(titleValue("  Ship it  ", "Ship it")).toBeNull();
  });

  it("returns the trimmed title when it really changed", () => {
    expect(titleValue("  Ship it twice  ", "Ship it")).toBe("Ship it twice");
    expect(titleValue("First title", null)).toBe("First title");
  });
});
