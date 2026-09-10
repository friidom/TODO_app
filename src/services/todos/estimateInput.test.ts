import { describe, expect, it } from "vitest";

import {
  estimateAlwaysVisible,
  estimateToDraft,
  formatEstimate,
  parseEstimateDraft,
} from "./estimateInput";

describe("formatEstimate", () => {
  it("shows a dash for an empty estimate", () => {
    expect(formatEstimate(null)).toBe("–");
  });

  it("shows an existing estimate as its own number", () => {
    expect(formatEstimate(5)).toBe("5");
  });

  it("shows a stored zero as 0, not as empty", () => {
    expect(formatEstimate(0)).toBe("0");
  });
});

describe("estimateToDraft", () => {
  it("starts an empty estimate's edit with an empty field", () => {
    expect(estimateToDraft(null)).toBe("");
  });

  it("starts an existing estimate's edit pre-filled with its value", () => {
    expect(estimateToDraft(8)).toBe("8");
  });
});

describe("parseEstimateDraft", () => {
  it("resolves an emptied draft to null rather than to zero", () => {
    expect(parseEstimateDraft("")).toBeNull();
  });

  it("treats a whitespace-only draft the same as empty", () => {
    expect(parseEstimateDraft("   ")).toBeNull();
  });

  it("keeps a written zero distinct from an emptied field", () => {
    expect(parseEstimateDraft("0")).toBe(0);
    expect(parseEstimateDraft("0")).not.toBeNull();
  });

  it("parses a positive whole number", () => {
    expect(parseEstimateDraft("5")).toBe(5);
  });

  it("parses a positive fraction", () => {
    expect(parseEstimateDraft("2.5")).toBe(2.5);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseEstimateDraft("  13  ")).toBe(13);
  });

  it("rejects a negative number", () => {
    expect(parseEstimateDraft("-1")).toBeUndefined();
  });

  it("rejects non-numeric input", () => {
    expect(parseEstimateDraft("abc")).toBeUndefined();
  });

  it("rejects a value with a non-numeric tail", () => {
    expect(parseEstimateDraft("3abc")).toBeUndefined();
  });

  it("rejects a bare minus sign", () => {
    expect(parseEstimateDraft("-")).toBeUndefined();
  });

  it("rejects Infinity", () => {
    expect(parseEstimateDraft("Infinity")).toBeUndefined();
  });
});

describe("estimateAlwaysVisible", () => {
  it("is false for an empty estimate — hidden until hover or focus", () => {
    expect(estimateAlwaysVisible(null)).toBe(false);
  });

  it("is true once a value is set, including a written zero", () => {
    expect(estimateAlwaysVisible(5)).toBe(true);
    expect(estimateAlwaysVisible(0)).toBe(true);
  });

  it("defaults to not forced, so the board card keeps its hover reveal", () => {
    expect(estimateAlwaysVisible(null, false)).toBe(false);
    expect(estimateAlwaysVisible(null)).toBe(
      estimateAlwaysVisible(null, false),
    );
  });

  it("is true for an unset estimate when the caller forces it", () => {
    expect(estimateAlwaysVisible(null, true)).toBe(true);
  });
});

describe("EstimateControl's interaction sequence", () => {
  it("entering edit mode seeds the draft from the current value", () => {
    expect(estimateToDraft(null)).toBe("");
    expect(estimateToDraft(13)).toBe("13");
  });

  it("save resolves the typed draft to the value onChange receives", () => {
    const draft = "8";

    expect(parseEstimateDraft(draft)).toBe(8);
  });

  it("cancel reverts the draft to the stored value, discarding the edit", () => {
    const stored = 5;
    const typedButDiscarded = "99";

    expect(estimateToDraft(stored)).not.toBe(typedButDiscarded);
    expect(estimateToDraft(stored)).toBe("5");
  });
});
