import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { signingSecretError, verifyWebhookSignature, type WebhookDelivery } from "./webhookSignature.js";

// The published example from the Standard Webhooks specification, which
// GitLab's signing token implements. Independent of this code and of GitLab.
const VECTOR = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: "1614265330",
  body: Buffer.from('{"test": 2432232314}'),
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};

const AT_VECTOR = { now: Number(VECTOR.timestamp) * 1000 };

function vector(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return { id: VECTOR.id, timestamp: VECTOR.timestamp, signature: VECTOR.signature, body: VECTOR.body, ...overrides };
}

function freshSecret(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

function sign(secret: string, id: string, timestamp: string, body: Buffer): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");

  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest("base64")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts the Standard Webhooks published vector", () => {
    expect(verifyWebhookSignature(vector(), VECTOR.secret, AT_VECTOR)).toEqual({
      ok: true,
      sentAt: new Date(1614265330 * 1000),
    });
  });

  it("refuses a body changed by a single byte", () => {
    const body = Buffer.from('{"test": 2432232315}');

    expect(verifyWebhookSignature(vector({ body }), VECTOR.secret, AT_VECTOR)).toEqual({
      ok: false,
      reason: "signature",
    });
  });

  it("refuses a different id or timestamp under the same signature", () => {
    expect(verifyWebhookSignature(vector({ id: "msg_other" }), VECTOR.secret, AT_VECTOR)).toMatchObject({
      reason: "signature",
    });
    expect(
      verifyWebhookSignature(vector({ timestamp: "1614265331" }), VECTOR.secret, AT_VECTOR),
    ).toMatchObject({ reason: "signature" });
  });

  it("refuses a signature made with another secret", () => {
    expect(verifyWebhookSignature(vector(), freshSecret(), AT_VECTOR)).toEqual({
      ok: false,
      reason: "signature",
    });
  });

  it("accepts when any one of several v1 signatures matches", () => {
    const wrong = sign(freshSecret(), VECTOR.id, VECTOR.timestamp, VECTOR.body);

    expect(
      verifyWebhookSignature(vector({ signature: `${wrong} ${VECTOR.signature}` }), VECTOR.secret, AT_VECTOR).ok,
    ).toBe(true);
    expect(
      verifyWebhookSignature(vector({ signature: `${VECTOR.signature}  ${wrong}` }), VECTOR.secret, AT_VECTOR).ok,
    ).toBe(true);
  });

  it("ignores signatures of other versions", () => {
    const digest = VECTOR.signature.slice("v1,".length);

    expect(
      verifyWebhookSignature(vector({ signature: `v2,${digest}` }), VECTOR.secret, AT_VECTOR),
    ).toMatchObject({ reason: "signature" });
    expect(
      verifyWebhookSignature(vector({ signature: `v1a,${digest} ${VECTOR.signature}` }), VECTOR.secret, AT_VECTOR)
        .ok,
    ).toBe(true);
  });

  it.each([
    ["no comma", "v1"],
    ["an empty digest", "v1,"],
    ["a digest that is not base64", "v1,not*base64!"],
    ["a truncated digest", "v1,g0hM9SsE+OTPJTGt"],
    ["a digest with trailing junk", `${VECTOR.signature},extra`],
    ["only spaces", "   "],
    ["an empty header", ""],
  ])("refuses a malformed signature header: %s", (_label, signature) => {
    expect(verifyWebhookSignature(vector({ signature }), VECTOR.secret, AT_VECTOR)).toEqual({
      ok: false,
      reason: "signature",
    });
  });

  it.each([
    ["webhook-id", { id: undefined }],
    ["an empty webhook-id", { id: "" }],
    ["an oversized webhook-id", { id: "x".repeat(257) }],
    ["webhook-timestamp", { timestamp: undefined }],
    ["a non-numeric webhook-timestamp", { timestamp: "1614265330.5" }],
    ["a negative webhook-timestamp", { timestamp: "-1614265330" }],
    ["webhook-signature", { signature: undefined }],
    ["an oversized webhook-signature", { signature: "v1,".padEnd(4097, "A") }],
  ])("refuses a delivery missing %s", (_label, overrides) => {
    expect(verifyWebhookSignature(vector(overrides), VECTOR.secret, AT_VECTOR)).toEqual({
      ok: false,
      reason: "headers",
    });
  });

  it("allows five minutes of clock difference either way, and no more", () => {
    const sent = Number(VECTOR.timestamp) * 1000;

    expect(verifyWebhookSignature(vector(), VECTOR.secret, { now: sent + 300_000 }).ok).toBe(true);
    expect(verifyWebhookSignature(vector(), VECTOR.secret, { now: sent - 300_000 }).ok).toBe(true);
    expect(verifyWebhookSignature(vector(), VECTOR.secret, { now: sent + 301_000 })).toEqual({
      ok: false,
      reason: "timestamp",
    });
    expect(verifyWebhookSignature(vector(), VECTOR.secret, { now: sent - 301_000 })).toEqual({
      ok: false,
      reason: "timestamp",
    });
  });

  it("refuses a correctly signed delivery replayed later", () => {
    expect(verifyWebhookSignature(vector(), VECTOR.secret)).toEqual({ ok: false, reason: "timestamp" });
  });

  it("checks against the current clock by default", () => {
    const secret = freshSecret();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from('{"object_kind":"push"}');
    const signature = sign(secret, "delivery-1", timestamp, body);

    expect(verifyWebhookSignature({ id: "delivery-1", timestamp, signature, body }, secret).ok).toBe(true);
  });

  it("refuses to verify with a malformed secret", () => {
    expect(verifyWebhookSignature(vector(), "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", AT_VECTOR)).toEqual({
      ok: false,
      reason: "secret",
    });
  });
});

describe("signingSecretError", () => {
  it("accepts a GitLab-shaped token", () => {
    expect(signingSecretError(freshSecret())).toBeUndefined();
    expect(signingSecretError(VECTOR.secret)).toBeUndefined();
  });

  it.each([
    ["no whsec_ prefix", `${randomBytes(32).toString("base64")}`, "prefix"],
    ["a differently cased prefix", `WHSEC_${randomBytes(32).toString("base64")}`, "prefix"],
    ["nothing after the prefix", "whsec_", "encoding"],
    ["characters outside base64", "whsec_not*base64!", "encoding"],
    ["base64url instead of base64", `whsec_${Buffer.alloc(32, 0xfb).toString("base64url")}`, "encoding"],
    ["surrounding whitespace", ` ${freshSecret()}`, "prefix"],
    ["a trailing newline", `${freshSecret()}\n`, "encoding"],
    ["missing padding", `whsec_${randomBytes(32).toString("base64").replace(/=+$/, "")}`, "encoding"],
    ["fewer than 24 bytes", `whsec_${randomBytes(23).toString("base64")}`, "length"],
    ["more than 64 bytes", `whsec_${randomBytes(65).toString("base64")}`, "length"],
  ])("refuses %s", (_label, token, error) => {
    expect(signingSecretError(token)).toBe(error);
  });
});

// The real GitLab.com deliveries captured in Phase 3A. Kept out of the
// repository (gitignored) with the signing token that signed them, so this
// block only runs on a machine that has them.
const LOCAL_FIXTURE = new URL("../../gitlab-fixture.local/", import.meta.url);
const TOKEN_FILE = new URL("signing-token.txt", LOCAL_FIXTURE);

describe.skipIf(!existsSync(TOKEN_FILE))("real GitLab.com deliveries (local fixture)", () => {
  const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, "utf8").trim() : "";
  const deliveries = existsSync(LOCAL_FIXTURE)
    ? readdirSync(LOCAL_FIXTURE)
        .filter((name) => /^delivery-\d+\.json$/.test(name))
        .map((name) => {
          const { headers } = JSON.parse(readFileSync(new URL(name, LOCAL_FIXTURE), "utf8")) as {
            headers: Record<string, string>;
          };

          return {
            name,
            delivery: {
              id: headers["webhook-id"],
              timestamp: headers["webhook-timestamp"],
              signature: headers["webhook-signature"],
              body: readFileSync(new URL(name.replace(/\.json$/, ".body"), LOCAL_FIXTURE)),
            },
          };
        })
    : [];

  it("has deliveries to check", () => {
    expect(deliveries.length).toBeGreaterThan(0);
  });

  it.each(deliveries)("verifies $name at the moment it was sent", ({ delivery }) => {
    const now = Number(delivery.timestamp) * 1000;

    expect(verifyWebhookSignature(delivery, token, { now }).ok).toBe(true);
  });

  it.each(deliveries)("refuses $name replayed now", ({ delivery }) => {
    expect(verifyWebhookSignature(delivery, token)).toEqual({ ok: false, reason: "timestamp" });
  });

  it.each(deliveries)("refuses $name with one byte of the body changed", ({ delivery }) => {
    const body = Buffer.from(delivery.body);
    body[body.length - 2] ^= 1;

    expect(
      verifyWebhookSignature({ ...delivery, body }, token, { now: Number(delivery.timestamp) * 1000 }),
    ).toEqual({ ok: false, reason: "signature" });
  });
});
