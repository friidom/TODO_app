import { describe, expect, it } from "vitest";

import {
  PASSWORD_MIN_LENGTH,
  hasErrors,
  validateAuthForm,
  validateEmail,
  validatePassword,
} from "./validation";

const TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;

describe("validateEmail", () => {
  it("requires something", () => {
    expect(validateEmail("")).toBe("Email is required.");
    expect(validateEmail("   ")).toBe("Email is required.");
  });

  it("rejects what is not shaped like an address", () => {
    expect(validateEmail("notanemail")).toBe("Enter a valid email address.");
    expect(validateEmail("no@domain")).toBe("Enter a valid email address.");
    expect(validateEmail("@example.com")).toBe("Enter a valid email address.");
    expect(validateEmail("two@@example.com")).toBe(
      "Enter a valid email address.",
    );
    expect(validateEmail("spaces in@example.com")).toBe(
      "Enter a valid email address.",
    );
  });

  it("accepts ordinary addresses", () => {
    expect(validateEmail("someone@example.com")).toBeUndefined();
    expect(validateEmail("first.last+tag@sub.example.co.uk")).toBeUndefined();
  });

  it("trims before checking the shape, matching what the form sends", () => {
    expect(validateEmail("  someone@example.com  ")).toBeUndefined();
  });
});

describe("validatePassword", () => {
  it("requires something", () => {
    expect(validatePassword("")).toBe("Password is required.");
  });

  it("enforces the minimum length", () => {
    expect(validatePassword("12345")).toBe(TOO_SHORT);
    expect(validatePassword("123456")).toBeUndefined();
    expect(validatePassword("a-long-enough-password")).toBeUndefined();
  });

  it("never trims: spaces are part of a password", () => {
    expect(validatePassword("      ")).toBeUndefined();
    expect(validatePassword("  a  ")).toBe(TOO_SHORT);
  });
});

describe("validateAuthForm", () => {
  it("reports nothing when both fields are fine", () => {
    expect(validateAuthForm("someone@example.com", "123456")).toEqual({});
  });

  it("reports both when both are missing", () => {
    expect(validateAuthForm("", "")).toEqual({
      email: "Email is required.",
      password: "Password is required.",
    });
  });

  it("does not report the field that is fine", () => {
    expect(validateAuthForm("nope", "123456")).toEqual({
      email: "Enter a valid email address.",
    });

    expect(validateAuthForm("someone@example.com", "12")).toEqual({
      password: TOO_SHORT,
    });
  });
});

describe("hasErrors", () => {
  it("is false only when nothing failed", () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ email: "Email is required." })).toBe(true);
    expect(hasErrors({ password: "Password is required." })).toBe(true);
  });

  it("agrees with validateAuthForm", () => {
    expect(hasErrors(validateAuthForm("someone@example.com", "123456"))).toBe(
      false,
    );
    expect(hasErrors(validateAuthForm("", ""))).toBe(true);
  });
});

describe("validateAuthForm — the username field (M10-01)", () => {
  it("checks the username only when the form has one", () => {
    // The login form passes two arguments and must not be told it is missing a
    // field it does not render.
    expect(validateAuthForm("someone@example.com", "123456").username).toBe(
      undefined,
    );
  });

  it("REPORTS A BAD USERNAME ALONGSIDE THE OTHER FIELDS", () => {
    const errors = validateAuthForm("nope", "123", "ad");

    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
    expect(errors.username).toMatch(/at least 3/);
  });

  it("accepts a whole valid registration", () => {
    const errors = validateAuthForm("ada@example.com", "123456", "ada_l");

    expect(errors).toEqual({});
    expect(hasErrors(errors)).toBe(false);
  });

  it("treats an empty username as a failure when the field exists", () => {
    const errors = validateAuthForm("ada@example.com", "123456", "");

    expect(errors.username).toBe("Username is required.");
    expect(hasErrors(errors)).toBe(true);
  });

  it("makes hasErrors fail on a username alone", () => {
    // Before M10-01 hasErrors only looked at email and password, so a bad
    // username would have submitted.
    expect(hasErrors({ username: "Username is required." })).toBe(true);
  });
});
