import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Deliberately says nothing about why: the message ends up in logs, and a
// reason ("bad tag", "wrong length") would only help someone probing.
export class SecretBoxError extends Error {
  constructor() {
    super("The stored secret could not be decrypted.");

    this.name = "SecretBoxError";
  }
}

// Exactly 32 bytes as canonical base64 (`openssl rand -base64 32`), so a key
// that is hex, truncated or padded with whitespace is refused rather than
// silently decoded into a different, weaker key.
export function parseSecretBoxKey(raw: string): Buffer | null {
  const key = Buffer.from(raw, "base64");

  return key.length === KEY_BYTES && key.toString("base64") === raw ? key : null;
}

// `context` is authenticated but not encrypted: binding a ciphertext to the
// row that owns it means one row's secret cannot be copied onto another.
export function sealSecret(plaintext: string, key: Buffer, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });

  cipher.setAAD(Buffer.from(context, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function openSecret(sealed: string, key: Buffer, context: string): string {
  const [version, iv, ciphertext, tag, ...rest] = sealed.split(".");

  if (version !== VERSION || iv === undefined || ciphertext === undefined || tag === undefined || rest.length > 0) {
    throw new SecretBoxError();
  }

  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");

  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES || key.length !== KEY_BYTES) {
    throw new SecretBoxError();
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, ivBytes, { authTagLength: TAG_BYTES });

    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tagBytes);

    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError();
  }
}
