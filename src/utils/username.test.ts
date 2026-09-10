import { describe, expect, it } from "vitest";

import {
  isUsernameShapeValid,
  normalizeUsername,
  USERNAME_MAX_LENGTH,
  validateUsername,
} from "./username";

describe("normalizeUsername", () => {
  it("trims and lowercases, which is the form the database stores", () => {
    expect(normalizeUsername("  Ada  ")).toBe("ada");
    expect(normalizeUsername("ADA_Lovelace")).toBe("ada_lovelace");
  });

  it("is idempotent, so normalising a stored name changes nothing", () => {
    expect(normalizeUsername(normalizeUsername(" Ada "))).toBe("ada");
  });

  it("leaves inner characters alone — it normalises, it does not repair", () => {
    expect(normalizeUsername(" Ada Lovelace ")).toBe("ada lovelace");
  });
});

describe("validateUsername — accepts", () => {
  it("ordinary names, digits and underscores", () => {
    expect(validateUsername("ada")).toBeUndefined();
    expect(validateUsername("ada_lovelace")).toBeUndefined();
    expect(validateUsername("ada99")).toBeUndefined();
    expect(validateUsername("9ada")).toBeUndefined();
  });

  it("names that only become valid once trimmed and lowercased", () => {
    expect(validateUsername("  ADA  ")).toBeUndefined();
  });

  it("the longest permitted name", () => {
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH))).toBeUndefined();
  });
});

describe("validateUsername — rejects", () => {
  it("an empty or whitespace-only field", () => {
    expect(validateUsername("")).toBe("Username is required.");
    expect(validateUsername("   ")).toBe("Username is required.");
  });

  it("names that are too short or too long, and says which", () => {
    expect(validateUsername("ad")).toMatch(/at least 3/);
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH + 1))).toMatch(
      /at most 30/,
    );
  });

  it("a leading underscore, because a name should read as identity", () => {
    expect(validateUsername("_ada")).toMatch(/start with a letter or a number/);
    expect(validateUsername("___")).toMatch(/start with a letter or a number/);
  });

  it("spaces, dots, hyphens and everything else in the middle", () => {
    const message =
      "Username can only contain letters, numbers and underscores.";

    expect(validateUsername("ada lovelace")).toBe(message);
    expect(validateUsername("ada.lovelace")).toBe(message);
    expect(validateUsername("ada-lovelace")).toBe(message);
    expect(validateUsername("ada@example")).toBe(message);
    expect(validateUsername("adaé")).toBe(message);
  });

  it("reports length before shape, so the first complaint is the useful one", () => {
    expect(validateUsername("a.")).toMatch(/at least 3/);
  });
});

describe("isUsernameShapeValid", () => {
  it("is the same decision as validateUsername, as a boolean", () => {
    expect(isUsernameShapeValid("ada")).toBe(true);
    expect(isUsernameShapeValid("ad")).toBe(false);
    expect(isUsernameShapeValid("  Ada ")).toBe(true);
  });
});

describe("case-insensitive collision, as the client sees it", () => {
  it("NORMALISES TWO SPELLINGS OF ONE NAME TO THE SAME STRING", () => {
    // client half of the unique index on lower(username) — Ada and ADA ask the identical question
    expect(normalizeUsername("Ada")).toBe(normalizeUsername("ADA"));
    expect(normalizeUsername(" aDa ")).toBe(normalizeUsername("ada"));
  });
});
