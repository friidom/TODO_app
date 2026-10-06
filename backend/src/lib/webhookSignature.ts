import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET_PREFIX = "whsec_";
const SIGNATURE_VERSION = "v1";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const TIMESTAMP = /^\d{1,12}$/;

const MIN_SECRET_BYTES = 24;
const MAX_SECRET_BYTES = 64;
const MAX_ID_LENGTH = 256;
const MAX_SIGNATURE_HEADER_LENGTH = 4096;

export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type SigningSecretError = "prefix" | "encoding" | "length";

function decodeBase64(value: string): Buffer | null {
  if (!BASE64.test(value) || value.length % 4 !== 0) return null;

  const bytes = Buffer.from(value, "base64");

  return bytes.toString("base64") === value ? bytes : null;
}

export function signingSecretError(token: string): SigningSecretError | undefined {
  if (!token.startsWith(SECRET_PREFIX)) return "prefix";

  const key = decodeBase64(token.slice(SECRET_PREFIX.length));

  if (key === null) return "encoding";

  if (key.length < MIN_SECRET_BYTES || key.length > MAX_SECRET_BYTES) return "length";

  return undefined;
}

export interface WebhookDelivery {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  body: Buffer;
}

export type WebhookVerification =
  | { ok: true; sentAt: Date }
  | { ok: false; reason: "headers" | "secret" | "timestamp" | "signature" };

interface VerifyOptions {
  now?: number;
  toleranceSeconds?: number;
}

function signatureMatches(entry: string, expected: Buffer): boolean {
  const comma = entry.indexOf(",");

  if (comma === -1 || entry.slice(0, comma) !== SIGNATURE_VERSION) return false;

  const candidate = decodeBase64(entry.slice(comma + 1));

  return candidate !== null && candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// The Standard Webhooks scheme GitLab signs with: HMAC-SHA256, keyed by the
// base64-decoded secret after "whsec_", over "{id}.{timestamp}.{raw body}".
export function verifyWebhookSignature(
  { id, timestamp, signature, body }: WebhookDelivery,
  secret: string,
  { now = Date.now(), toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS }: VerifyOptions = {},
): WebhookVerification {
  if (
    id === undefined ||
    id === "" ||
    id.length > MAX_ID_LENGTH ||
    timestamp === undefined ||
    !TIMESTAMP.test(timestamp) ||
    signature === undefined ||
    signature.length > MAX_SIGNATURE_HEADER_LENGTH
  ) {
    return { ok: false, reason: "headers" };
  }

  if (signingSecretError(secret) !== undefined) return { ok: false, reason: "secret" };

  const sentAt = Number(timestamp);

  if (Math.abs(now / 1000 - sentAt) > toleranceSeconds) return { ok: false, reason: "timestamp" };

  const key = Buffer.from(secret.slice(SECRET_PREFIX.length), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest();

  // Several space-separated signatures arrive while a secret is being rotated.
  const matched = signature
    .split(" ")
    .filter((entry) => entry !== "")
    .some((entry) => signatureMatches(entry, expected));

  return matched ? { ok: true, sentAt: new Date(sentAt * 1000) } : { ok: false, reason: "signature" };
}
