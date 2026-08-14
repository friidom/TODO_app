import { describe, expect, it } from "vitest";

import { confirmLabel, confirmMatches } from "./deleteConfirm";

describe("confirmLabel", () => {
  it("is the board's title", () => {
    expect(confirmLabel("Roadmap")).toBe("Roadmap");
  });

  it("falls back to the label an untitled board actually renders", () => {
    // `boards.title` is nullable. Asking for a null title would make the box
    // impossible to satisfy, so the target is what is on screen.
    expect(confirmLabel(null)).toBe("Untitled board");
    expect(confirmLabel("   ")).toBe("Untitled board");
  });
});

describe("confirmMatches", () => {
  it("accepts the exact title", () => {
    expect(confirmMatches("Roadmap", "Roadmap")).toBe(true);
  });

  it("forgives surrounding whitespace", () => {
    expect(confirmMatches("  Roadmap  ", "Roadmap")).toBe(true);
  });

  it("is case-sensitive — that is the part that proves it was read", () => {
    expect(confirmMatches("roadmap", "Roadmap")).toBe(false);
  });

  it("refuses a near miss and an empty box", () => {
    expect(confirmMatches("Roadmapp", "Roadmap")).toBe(false);
    expect(confirmMatches("", "Roadmap")).toBe(false);
    expect(confirmMatches("   ", "Roadmap")).toBe(false);
  });

  it("lets an untitled board be confirmed by its rendered label", () => {
    expect(confirmMatches("Untitled board", null)).toBe(true);
    expect(confirmMatches("", null)).toBe(false);
  });
});
