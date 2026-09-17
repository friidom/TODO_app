import { describe, expect, it } from "vitest";

import {
  isValidUsername,
  normalizeUsername,
  suffixedUsername,
  usernameBase,
  USERNAME_MAX_LENGTH,
  validateUsername,
} from "./username.js";

describe("normalizeUsername", () => {
  it("trims and folds case", () => {
    expect(normalizeUsername("  Ada_Lovelace  ")).toBe("ada_lovelace");
  });
});

describe("validateUsername", () => {
  it("accepts a well-formed name", () => {
    expect(validateUsername("ada_99")).toBeUndefined();
  });

  it("accepts the boundary lengths the CHECK allows", () => {
    expect(validateUsername("abc")).toBeUndefined();
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH))).toBeUndefined();
  });

  it.each([
    ["", "Username is required."],
    ["ab", "Username must be at least 3 characters."],
    ["a".repeat(31), "Username must be at most 30 characters."],
    ["_ada", "Username must start with a letter or a number."],
    ["ada lovelace", "Username can only contain letters, numbers and underscores."],
    ["ada@home", "Username can only contain letters, numbers and underscores."],
  ])("rejects %j", (input, message) => {
    expect(validateUsername(input)).toBe(message);
  });
});

describe("isValidUsername agrees with profiles_username_shape", () => {
  const CHECK = /^[a-z0-9][a-z0-9_]{2,29}$/;

  it.each(["ada", "a_b_c", "0ada", "ada_lovelace_1815", "a".repeat(30), "_ada", "AB", "ada-x", ""])(
    "%j",
    (candidate) => {
      expect(isValidUsername(candidate)).toBe(CHECK.test(candidate));
    },
  );
});

describe("usernameBase", () => {
  it("keeps a name that is already valid", () => {
    expect(usernameBase("Ada_Lovelace", "seed")).toBe("ada_lovelace");
  });

  it("repairs the characters an email local part brings with it", () => {
    expect(usernameBase("ada.lovelace", "seed")).toBe("ada_lovelace");
  });

  it("strips leading characters the shape forbids rather than rejecting", () => {
    expect(usernameBase("...ada", "seed")).toBe("ada");
  });

  it("pads a name shorter than the minimum, and still produces a valid one", () => {
    const base = usernameBase("ab", "seed");

    expect(base.length).toBeGreaterThanOrEqual(3);
    expect(isValidUsername(base)).toBe(true);
  });

  it("is deterministic for one seed and different across seeds", () => {
    expect(usernameBase("a", "seed-one")).toBe(usernameBase("a", "seed-one"));
    expect(usernameBase("a", "seed-one")).not.toBe(usernameBase("a", "seed-two"));
  });

  it("truncates to the length the CHECK allows", () => {
    expect(usernameBase("a".repeat(60), "seed")).toHaveLength(USERNAME_MAX_LENGTH);
  });

  it("produces a valid username from input made entirely of forbidden characters", () => {
    expect(isValidUsername(usernameBase("...", "seed"))).toBe(true);
  });
});

describe("suffixedUsername", () => {
  it("appends the suffix", () => {
    expect(suffixedUsername("ada", 2)).toBe("ada2");
  });

  it("never exceeds the maximum, however long the suffix", () => {
    const base = "a".repeat(USERNAME_MAX_LENGTH);

    expect(suffixedUsername(base, 2)).toHaveLength(USERNAME_MAX_LENGTH);
    expect(suffixedUsername(base, 1234)).toHaveLength(USERNAME_MAX_LENGTH);
    expect(suffixedUsername(base, 1234).endsWith("1234")).toBe(true);
  });
});
