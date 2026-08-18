import { describe, expect, it } from "vitest";

import { commentValue, editedValue, isEdited } from "./commentDraft";

describe("commentValue", () => {
  it("returns the trimmed text", () => {
    expect(commentValue("  looks good to me  ")).toBe("looks good to me");
  });

  it("REFUSES AN EMPTY SUBMISSION", () => {
    expect(commentValue("")).toBeNull();
  });

  it("REFUSES A WHITESPACE-ONLY SUBMISSION", () => {
    // The plan names both cases explicitly, and the database refuses them too
    // (`comments_content_not_blank` uses btrim for exactly this). This is what
    // keeps the button disabled rather than the write failing.
    expect(commentValue("   ")).toBeNull();
    expect(commentValue("\n\t  \n")).toBeNull();
  });

  it("keeps interior newlines — a paragraph break is not whitespace to strip", () => {
    expect(commentValue("first\n\nsecond")).toBe("first\n\nsecond");
  });
});

describe("editedValue", () => {
  it("returns the trimmed text when it changed", () => {
    expect(editedValue("  now it says this ", "it said this")).toBe(
      "now it says this",
    );
  });

  it("returns null when the draft is unchanged", () => {
    // Re-submitting without typing must not move updated_at, which would put
    // an "edited" marker on a comment nobody edited.
    expect(editedValue("unchanged", "unchanged")).toBeNull();
  });

  it("treats a draft that only gained whitespace as unchanged", () => {
    expect(editedValue("  unchanged  ", "unchanged")).toBeNull();
  });

  it("REVERTS RATHER THAN CLEARING when the draft is blanked", () => {
    // content is NOT NULL and checked non-blank, so an empty edit has no
    // representation. Deleting is a different control with different
    // permissions — this is titleValue's rule, applied to the same problem.
    expect(editedValue("", "still here")).toBeNull();
    expect(editedValue("   ", "still here")).toBeNull();
  });
});

describe("isEdited", () => {
  it("is false for a comment that was only ever posted", () => {
    // Both columns default to now() in one transaction, so they are exactly
    // equal until the trigger fires.
    const at = "2026-08-18T09:00:00.000Z";

    expect(isEdited({ created_at: at, updated_at: at })).toBe(false);
  });

  it("is true once the trigger has stamped an update", () => {
    expect(
      isEdited({
        created_at: "2026-08-18T09:00:00.000Z",
        updated_at: "2026-08-18T09:04:12.000Z",
      }),
    ).toBe(true);
  });
});
