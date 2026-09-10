import { describe, expect, it } from "vitest";

import { identifierKind, normalizeIdentifier } from "./identifier";
import { normalizeUsername } from "./username";
import { validateIdentifier } from "./validation";

describe("telling an email from a username", () => {
  it("reads anything with an @ as an email", () => {
    expect(identifierKind("ada@example.com")).toBe("email");
    expect(identifierKind("a@b.co")).toBe("email");
  });

  it("reads anything without one as a username", () => {
    expect(identifierKind("ada")).toBe("username");
    expect(identifierKind("ada_lovelace")).toBe("username");
    expect(identifierKind("user123")).toBe("username");
  });

  it("PARTITIONS THE SPACE EXACTLY — a username cannot contain an @", () => {
    expect(identifierKind("")).toBe("username");
    expect(identifierKind("not an email")).toBe("username");
    // malformed but unambiguously meant as an address
    expect(identifierKind("ada@")).toBe("email");
    expect(identifierKind("@ada")).toBe("email");
  });
});

describe("normalising what gets sent", () => {
  it("trims an email but preserves its case", () => {
    // local part is case-sensitive by RFC — folding it is Supabase's business
    expect(normalizeIdentifier("  Ada@Example.com  ")).toEqual({
      kind: "email",
      value: "Ada@Example.com",
    });
  });

  it("LOWERCASES AND TRIMS A USERNAME, so case cannot lock anyone out", () => {
    expect(normalizeIdentifier("ADA").value).toBe("ada");
    expect(normalizeIdentifier("  Ada  ").value).toBe("ada");
    expect(normalizeIdentifier("AdA_LoVeLaCe").value).toBe("ada_lovelace");
  });

  it("uses THE SAME normaliser registration uses", () => {
    for (const raw of ["ADA", " Ada ", "ada", "AdA_1"]) {
      expect(normalizeIdentifier(raw).value).toBe(normalizeUsername(raw));
    }
  });
});

describe("validating the login field", () => {
  it("accepts a valid email", () => {
    expect(validateIdentifier("ada@example.com")).toBeUndefined();
  });

  it("accepts a valid username in any case", () => {
    expect(validateIdentifier("ada_lovelace")).toBeUndefined();
    expect(validateIdentifier("ADA")).toBeUndefined();
    expect(validateIdentifier("  Ada  ")).toBeUndefined();
  });

  it("rejects an empty field", () => {
    expect(validateIdentifier("")).toBe("Email or username is required.");
    expect(validateIdentifier("   ")).toBe("Email or username is required.");
  });

  it("reports a malformed address as an address problem", () => {
    expect(validateIdentifier("ada@")).toBe("Enter a valid email address.");
  });

  it("names BOTH possibilities for a malformed username", () => {
    expect(validateIdentifier("ad")).toBe(
      "Enter a valid email address or username.",
    );
    expect(validateIdentifier("_ada")).toBe(
      "Enter a valid email address or username.",
    );
  });

  it("NEVER reports whether an account exists", () => {
    // would build an enumeration oracle otherwise — every well-formed identifier passes, real or not
    expect(validateIdentifier("definitely_not_a_user_99")).toBeUndefined();
    expect(validateIdentifier("nobody@nowhere.example")).toBeUndefined();
  });
});
