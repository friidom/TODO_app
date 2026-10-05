import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BOARD_KEY_MAX_LENGTH,
  BOARD_KEY_MIN_LENGTH,
  boardKeyBase,
  boardKeyError,
  normalizeBoardKey,
  suffixedBoardKey,
  type BoardKeyError,
} from "./boardKey.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../../board-key-fixture.json", import.meta.url), "utf8"),
) as {
  minLength: number;
  maxLength: number;
  valid: { input: string; expected: string }[];
  invalid: { input: string; error: BoardKeyError }[];
};

describe("boardKeyError (parity with board-key-fixture.json)", () => {
  it("agrees on the length bounds", () => {
    expect(BOARD_KEY_MIN_LENGTH).toBe(fixture.minLength);
    expect(BOARD_KEY_MAX_LENGTH).toBe(fixture.maxLength);
  });

  it.each(fixture.valid)("accepts $input as $expected", ({ input, expected }) => {
    expect(boardKeyError(input)).toBeUndefined();
    expect(normalizeBoardKey(input)).toBe(expected);
  });

  it.each(fixture.invalid)("refuses $input as $error", ({ input, error }) => {
    expect(boardKeyError(input)).toBe(error);
  });
});

describe("boardKeyBase", () => {
  it.each([
    ["API", "API"],
    ["Hobby", "HOB"],
    ["Hobbies", "HOB"],
    ["Marketing", "MAR"],
    ["Platform", "PLA"],
    ["My New Hobbies", "MNH"],
    ["My New Hobby", "MNH"],
    ["Core API", "CA"],
    ["Authentication Identity", "AI"],
    ["Authentication & Identity", "AI"],
    ["Hobby Board", "HB"],
    ["Hobby Project", "HP"],
    ["iOS App", "IA"],
    ["Web 2", "W2"],
  ])("%s → %s", (title, expected) => {
    expect(boardKeyBase(title)).toBe(expected);
  });

  it("strips accents rather than dropping the letter", () => {
    expect(boardKeyBase("Café Économie")).toBe("CE");
  });

  it("transliterates Russian and Uzbek Cyrillic", () => {
    expect(boardKeyBase("Маркетинг")).toBe("MAR");
    expect(boardKeyBase("Мои хобби")).toBe("MH");
    expect(boardKeyBase("Ўзбек тили")).toBe("OT");
  });

  it("keeps an apostrophe-joined word whole", () => {
    expect(boardKeyBase("Oʻzbekiston")).toBe("OZB");
    expect(boardKeyBase("Don't Panic")).toBe("DP");
  });

  it("never starts with a digit", () => {
    expect(boardKeyBase("2024 Roadmap")).toBe("ROA");
    expect(boardKeyBase("3D Printing")).toBe("DP");
  });

  it("caps a long acronym at the maximum length", () => {
    expect(boardKeyBase("a b c d e f g h i j k l")).toBe("ABCDEFGHIJ");
  });

  it.each(["", "   ", "X", "!!!", "2024", "设计"])(
    "falls back when %j yields fewer than two usable characters",
    (title) => {
      expect(boardKeyBase(title)).toBe("BRD");
    },
  );

  it("always yields a key the validator accepts", () => {
    const titles = ["API", "My New Hobbies", "Маркетинг", "2024 Roadmap", "设计", "x".repeat(200)];

    for (const title of titles) expect(boardKeyError(boardKeyBase(title))).toBeUndefined();
  });
});

describe("suffixedBoardKey", () => {
  it("appends the suffix", () => {
    expect(suffixedBoardKey("MNH", 2)).toBe("MNH2");
  });

  it("truncates the base so the result stays within the maximum", () => {
    expect(suffixedBoardKey("ABCDEFGHIJ", 2)).toBe("ABCDEFGHI2");
    expect(suffixedBoardKey("ABCDEFGHIJ", 12)).toBe("ABCDEFGH12");
  });
});
