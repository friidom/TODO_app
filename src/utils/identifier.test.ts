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
    // The database enforces the same pattern in `profiles_username_shape`, so
    // there is no ambiguous middle for this rule to get wrong.
    expect(identifierKind("")).toBe("username");
    expect(identifierKind("not an email")).toBe("username");
    // Malformed, but unambiguously *intended* as an address — which is the
    // branch that then reports "enter a valid email address".
    expect(identifierKind("ada@")).toBe("email");
    expect(identifierKind("@ada")).toBe("email");
  });
});

describe("normalising what gets sent", () => {
  it("trims an email but preserves its case", () => {
    // The local part of an address is case-sensitive by RFC. Folding it is
    // Supabase's business, not this function's.
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
    // The property that matters: if the canonical form ever changes, login and
    // registration change together. A second lowercase here would be a second
    // definition that could drift.
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
    // It has an @, so the user was clearly typing an email — telling them to
    // check their username would be actively unhelpful.
    expect(validateIdentifier("ada@")).toBe("Enter a valid email address.");
  });

  it("names BOTH possibilities for a malformed username", () => {
    // No @, so we cannot know which they meant. The message must not guess.
    expect(validateIdentifier("ad")).toBe(
      "Enter a valid email address or username.",
    );
    expect(validateIdentifier("_ada")).toBe(
      "Enter a valid email address or username.",
    );
  });

  it("NEVER reports whether an account exists", () => {
    // Existence is the server's answer, and asking it here would build exactly
    // the enumeration oracle `login_email_for` is written to avoid. Every
    // well-formed identifier passes validation, real or not.
    expect(validateIdentifier("definitely_not_a_user_99")).toBeUndefined();
    expect(validateIdentifier("nobody@nowhere.example")).toBeUndefined();
  });
});
