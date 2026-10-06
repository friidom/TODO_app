import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { openSecret, parseSecretBoxKey, SecretBoxError, sealSecret } from "./secretBox.js";

const key = randomBytes(32);
const TOKEN = `whsec_${randomBytes(32).toString("base64")}`;
const CONTEXT = "board_gitlab_projects:7b0a2c1e-0000-4000-8000-000000000001";

function tamper(sealed: string, part: number): string {
  const parts = sealed.split(".");
  const bytes = Buffer.from(parts[part]!, "base64url");
  bytes[0]! ^= 1;
  parts[part] = bytes.toString("base64url");

  return parts.join(".");
}

describe("sealSecret / openSecret", () => {
  it("round-trips a signing token", () => {
    expect(openSecret(sealSecret(TOKEN, key, CONTEXT), key, CONTEXT)).toBe(TOKEN);
  });

  it("round-trips non-ASCII text", () => {
    expect(openSecret(sealSecret("ключ · 🔑", key, CONTEXT), key, CONTEXT)).toBe("ключ · 🔑");
  });

  it("never stores the plaintext, and never seals it the same way twice", () => {
    const first = sealSecret(TOKEN, key, CONTEXT);
    const second = sealSecret(TOKEN, key, CONTEXT);

    expect(first).not.toContain(TOKEN);
    expect(first).not.toContain(TOKEN.slice("whsec_".length));
    expect(first).not.toBe(second);
    expect(first).toMatch(/^v1\.[\w-]{16}\.[\w-]+\.[\w-]{22}$/);
  });

  it("refuses the wrong key", () => {
    const sealed = sealSecret(TOKEN, key, CONTEXT);

    expect(() => openSecret(sealed, randomBytes(32), CONTEXT)).toThrow(SecretBoxError);
  });

  it("refuses a ciphertext moved to another row", () => {
    const sealed = sealSecret(TOKEN, key, CONTEXT);

    expect(() => openSecret(sealed, key, "board_gitlab_projects:another-link")).toThrow(SecretBoxError);
  });

  it.each([
    [1, "nonce"],
    [2, "ciphertext"],
    [3, "authentication tag"],
  ])("refuses a tampered part %s (%s)", (part) => {
    const sealed = sealSecret(TOKEN, key, CONTEXT);

    expect(() => openSecret(tamper(sealed, part), key, CONTEXT)).toThrow(SecretBoxError);
  });

  it.each([
    ["an unknown version", (sealed: string) => sealed.replace(/^v1\./, "v2.")],
    ["a missing part", (sealed: string) => sealed.split(".").slice(0, 3).join(".")],
    ["an extra part", (sealed: string) => `${sealed}.extra`],
    ["a truncated tag", (sealed: string) => sealed.slice(0, -4)],
    ["an empty string", () => ""],
  ])("refuses %s", (_label, mangle) => {
    expect(() => openSecret(mangle(sealSecret(TOKEN, key, CONTEXT)), key, CONTEXT)).toThrow(SecretBoxError);
  });

  it("refuses a key of the wrong length", () => {
    const sealed = sealSecret(TOKEN, key, CONTEXT);

    expect(() => openSecret(sealed, key.subarray(0, 16), CONTEXT)).toThrow(SecretBoxError);
  });

  it("says nothing about the secret or the cause when it fails", () => {
    const sealed = sealSecret(TOKEN, key, CONTEXT);

    try {
      openSecret(sealed, randomBytes(32), CONTEXT);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SecretBoxError);
      expect((error as Error).message).toBe("The stored secret could not be decrypted.");
      expect((error as Error).message).not.toContain(TOKEN);
      expect((error as Error).cause).toBeUndefined();
    }
  });
});

describe("parseSecretBoxKey", () => {
  it("accepts 32 random bytes as base64", () => {
    const raw = randomBytes(32).toString("base64");

    expect(parseSecretBoxKey(raw)?.equals(Buffer.from(raw, "base64"))).toBe(true);
  });

  it.each([
    ["31 bytes", randomBytes(31).toString("base64")],
    ["33 bytes", randomBytes(33).toString("base64")],
    ["64 bytes", randomBytes(64).toString("base64")],
    ["hex", randomBytes(32).toString("hex")],
    ["base64url", Buffer.alloc(32, 0xfb).toString("base64url")],
    ["missing padding", randomBytes(32).toString("base64").replace(/=$/, "")],
    ["surrounding whitespace", ` ${randomBytes(32).toString("base64")} `],
    ["an empty string", ""],
    ["a passphrase", "correct horse battery staple and more words"],
  ])("refuses %s", (_label, raw) => {
    expect(parseSecretBoxKey(raw)).toBeNull();
  });
});
