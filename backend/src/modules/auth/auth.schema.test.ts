import { describe, expect, it } from "vitest";

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "../../config/constants.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schema.js";

const VALID = {
  email: "ada@example.com",
  password: "a-long-enough-password",
  username: "ada_lovelace",
};

describe("registerSchema", () => {
  it("accepts a well-formed registration", () => {
    expect(registerSchema.parse(VALID)).toEqual(VALID);
  });

  it("normalises the username so the stored name matches what login resolves", () => {
    expect(registerSchema.parse({ ...VALID, username: "  Ada_Lovelace " }).username).toBe(
      "ada_lovelace",
    );
  });

  it("trims the email", () => {
    expect(registerSchema.parse({ ...VALID, email: "  ada@example.com " }).email).toBe(
      "ada@example.com",
    );
  });

  it.each(["", "short", "a".repeat(PASSWORD_MIN_LENGTH - 1)])(
    "rejects the password %j for being too short",
    (password) => {
      expect(registerSchema.safeParse({ ...VALID, password }).success).toBe(false);
    },
  );

  it("accepts a password exactly at the minimum", () => {
    expect(
      registerSchema.safeParse({ ...VALID, password: "a".repeat(PASSWORD_MIN_LENGTH) }).success,
    ).toBe(true);
  });

  it("rejects a password past the cap, so argon2 is never handed one", () => {
    expect(
      registerSchema.safeParse({ ...VALID, password: "a".repeat(PASSWORD_MAX_BYTES + 1) }).success,
    ).toBe(false);
  });

  it.each(["nope", "ada@", "@example.com", "ada example@x.com"])(
    "rejects the email %j",
    (email) => {
      expect(registerSchema.safeParse({ ...VALID, email }).success).toBe(false);
    },
  );

  it.each(["ab", "_ada", "ada lovelace", "a".repeat(31)])(
    "rejects the username %j with the message the form shows",
    (username) => {
      const result = registerSchema.safeParse({ ...VALID, username });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/^Username/);
    },
  );
});

describe("loginSchema", () => {
  it("accepts a password that would fail the registration policy", () => {
    expect(loginSchema.safeParse({ identifier: "ada", password: "x" }).success).toBe(true);
  });

  it("accepts an email or a username as the identifier", () => {
    expect(loginSchema.parse({ identifier: " ada@example.com ", password: "x" }).identifier).toBe(
      "ada@example.com",
    );
    expect(loginSchema.parse({ identifier: "ada", password: "x" }).identifier).toBe("ada");
  });

  it("rejects an empty identifier or password", () => {
    expect(loginSchema.safeParse({ identifier: "", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: "ada", password: "" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  // The endpoint always answers 200, so a malformed address must take the
  // same path as an unknown one, not a 400.
  it("accepts an address that is not a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(true);
  });

  it("still rejects an empty one", () => {
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("holds the new password to the registration policy", () => {
    expect(resetPasswordSchema.safeParse({ token: "t", password: "short" }).success).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "t", password: "a-long-enough-password" }).success,
    ).toBe(true);
  });

  it("requires a token", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "", password: "a-long-enough-password" }).success,
    ).toBe(false);
  });
});
