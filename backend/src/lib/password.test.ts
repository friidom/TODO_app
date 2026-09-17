import { describe, expect, it } from "vitest";

import { PASSWORD_MAX_BYTES } from "../config/constants.js";
import {
  assertPasswordLength,
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from "./password.js";

const PASSWORD = "correct horse battery staple";

describe("hashPassword", () => {
  it("produces an argon2id hash, not the password", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(PASSWORD);
  });

  it("gives a different hash for the same password each time", async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it("refuses a password longer than the byte cap", async () => {
    await expect(hashPassword("a".repeat(PASSWORD_MAX_BYTES + 1))).rejects.toThrow(
      /at most 128 bytes/,
    );
  });

  // 60 emoji are 60 characters but 240 bytes.
  it("measures the cap in bytes rather than characters", () => {
    expect(() => assertPasswordLength("😀".repeat(40))).toThrow(/at most 128 bytes/);
    expect(() => assertPasswordLength("a".repeat(PASSWORD_MAX_BYTES))).not.toThrow();
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, "Correct horse battery staple")).toBe(false);
  });

  it("returns false rather than throwing on an unparseable hash", async () => {
    expect(await verifyPassword("not-a-hash", PASSWORD)).toBe(false);
    expect(await verifyPassword("", PASSWORD)).toBe(false);
  });

  it("returns false for an over-length password instead of throwing", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword(hash, "a".repeat(PASSWORD_MAX_BYTES + 1))).toBe(false);
  });
});

describe("verifyDummyPassword", () => {
  it("is always false", async () => {
    expect(await verifyDummyPassword(PASSWORD)).toBe(false);
    expect(await verifyDummyPassword("")).toBe(false);
  });

  // Compared loosely — CI machines are noisy.
  it("costs about as much as verifying a real hash", async () => {
    const hash = await hashPassword(PASSWORD);

    const realStart = performance.now();
    await verifyPassword(hash, PASSWORD);
    const real = performance.now() - realStart;

    const dummyStart = performance.now();
    await verifyDummyPassword(PASSWORD);
    const dummy = performance.now() - dummyStart;

    expect(dummy).toBeGreaterThan(real / 4);
    expect(dummy).toBeLessThan(real * 4);
  });
});
