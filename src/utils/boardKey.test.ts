import { describe, expect, it } from "vitest";

import fixtureJson from "../../board-key-fixture.json";
import {
  BOARD_KEY_MAX_LENGTH,
  BOARD_KEY_MIN_LENGTH,
  boardKeyError,
  boardKeyField,
  normalizeBoardKey,
  type BoardKeyError,
} from "./boardKey";

const fixture = fixtureJson as {
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

  it.each(fixture.valid)(
    "accepts $input as $expected",
    ({ input, expected }) => {
      expect(boardKeyError(input)).toBeUndefined();
      expect(normalizeBoardKey(input)).toBe(expected);
    },
  );

  it.each(fixture.invalid)("refuses $input as $error", ({ input, error }) => {
    expect(boardKeyError(input)).toBe(error);
  });
});

describe("boardKeyField", () => {
  const fresh = { key_prefix: "MNH", next_key: 1 };
  const used = { key_prefix: "MNH", next_key: 24 };

  it("does not warn on a board that has never had a card", () => {
    expect(boardKeyField("HOB", fresh)).toMatchObject({
      warn: false,
      error: undefined,
    });
  });

  it("warns once the board has had a card", () => {
    expect(boardKeyField("MNH", used).warn).toBe(true);
  });

  it("warns without blocking the save", () => {
    expect(boardKeyField("hob", used)).toEqual({
      key: "HOB",
      error: undefined,
      changed: true,
      warn: true,
    });
  });

  it("is unchanged when only case or spacing differ", () => {
    expect(boardKeyField(" mnh ", used).changed).toBe(false);
  });

  it("reports an invalid draft as an error", () => {
    expect(boardKeyField("MY HOBBIES", used).error).toBe("shape");
    expect(boardKeyField("@API", used).error).toBe("shape");
    expect(boardKeyField("", used).error).toBe("required");
  });
});
