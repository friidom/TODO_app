import { describe, expect, it } from "vitest";

import { updateBoardSchema } from "./boards.schema.js";

const TABS = [
  { mode: "board", label: null, hidden: false },
  { mode: "list", label: "Everything", hidden: false },
  { mode: "calendar", label: null, hidden: true },
];

function parse(view_tabs: unknown) {
  return updateBoardSchema.safeParse({ view_tabs });
}

describe("updateBoardSchema view_tabs", () => {
  it("accepts an ordered tab list", () => {
    expect(updateBoardSchema.parse({ view_tabs: TABS })).toEqual({ view_tabs: TABS });
  });

  it("accepts null, which restores the default set", () => {
    expect(updateBoardSchema.parse({ view_tabs: null })).toEqual({ view_tabs: null });
  });

  it("accepts a mode it has never heard of, because the view list is the client's", () => {
    expect(parse([{ mode: "roadmap_view", label: null, hidden: false }]).success).toBe(true);
  });

  it("refuses the same mode twice", () => {
    expect(parse([TABS[0], { ...TABS[0], label: "Again" }]).success).toBe(false);
  });

  it.each(["", "Board", "1board", "board-view", "a".repeat(33)])("refuses the mode %j", (mode) => {
    expect(parse([{ mode, label: null, hidden: false }]).success).toBe(false);
  });

  it("trims a label", () => {
    const parsed = updateBoardSchema.parse({
      view_tabs: [{ mode: "list", label: "  Everything  ", hidden: false }],
    });

    expect(parsed.view_tabs?.[0]?.label).toBe("Everything");
  });

  it.each(["", "   ", "a".repeat(41)])("refuses the label %j", (label) => {
    expect(parse([{ mode: "list", label, hidden: false }]).success).toBe(false);
  });

  it("refuses an entry missing hidden", () => {
    expect(parse([{ mode: "list", label: null }]).success).toBe(false);
  });

  it("strips unknown keys from an entry", () => {
    const parsed = updateBoardSchema.parse({
      view_tabs: [{ mode: "list", label: null, hidden: false, color: "red" }],
    });

    expect(parsed.view_tabs?.[0]).toEqual({ mode: "list", label: null, hidden: false });
  });

  it("refuses more than twenty tabs", () => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      mode: `view_${String.fromCharCode(97 + index)}`,
      label: null,
      hidden: false,
    }));

    expect(parse(many.slice(0, 20)).success).toBe(true);
    expect(parse(many).success).toBe(false);
  });

  it("refuses a value that is not an array", () => {
    expect(parse({ mode: "list" }).success).toBe(false);
  });
});

describe("updateBoardSchema key_prefix", () => {
  it("normalizes to the stored form", () => {
    expect(updateBoardSchema.parse({ key_prefix: "  hob " })).toEqual({ key_prefix: "HOB" });
  });

  it.each(["", "my hobbies", "MY-HOBBIES", "@#$", "2FA", "A", "ABCDEFGHIJK"])(
    "refuses %j",
    (key_prefix) => {
      expect(updateBoardSchema.safeParse({ key_prefix }).success).toBe(false);
    },
  );

  it("names the rule in the message", () => {
    const result = updateBoardSchema.safeParse({ key_prefix: "hello world" });

    expect(result.error?.issues[0]?.message).toBe(
      "Board key must contain only letters and numbers and start with a letter.",
    );
  });
});
