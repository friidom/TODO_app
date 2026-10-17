import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

const sent = vi.hoisted(() => ({
  messages: [] as { to: string; subject: string; text: string; html?: string }[],
  fail: false,
}));

vi.mock("../../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../config/env.js")>();

  return { ...original, env: { ...original.env, AUTH_REQUIRE_EMAIL_VERIFICATION: true } };
});

vi.mock("../../lib/mail.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/mail.js")>();

  return {
    ...original,
    mailer: {
      send: async (message: (typeof sent.messages)[number]) => {
        if (sent.fail) {
          throw Object.assign(new Error(`535 rejected for ${message.to}: ${message.text}`), {
            code: "EAUTH",
            responseCode: 535,
            command: "AUTH PLAIN",
          });
        }

        sent.messages.push(message);
      },
    },
  };
});

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  sent.messages = [];
  sent.fail = false;
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

const PASSWORD = "correct horse battery";

let counter = 0;

async function register() {
  counter += 1;
  const email = `verify-${counter}-${Date.now()}@test.invalid`;
  const response = await client.post<{ needsVerification: boolean; accessToken?: string }>(
    "/api/v1/auth/register",
    { email, password: PASSWORD, username: `verify_${counter}_${Date.now() % 100000}` },
  );

  return { email, response };
}

const login = (identifier: string, password = PASSWORD) =>
  client.post<{ accessToken?: string; error?: { message: string } }>("/api/v1/auth/login", {
    identifier,
    password,
  });

const tokenFrom = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

describe("email verification", () => {
  it("mails a single-use link on registration and issues no session until it is used", async () => {
    const { email, response } = await register();

    expect(response.status).toBe(201);
    expect(response.body.needsVerification).toBe(true);
    expect(response.body.accessToken).toBeUndefined();

    expect(sent.messages).toHaveLength(1);
    const [mail] = sent.messages;
    expect(mail.to).toBe(email);
    expect(mail.text).toMatch(/\/verify-email\?token=/);
    expect(mail.html).toContain("Confirm email");

    const token = tokenFrom(mail.text);
    const stored = await prisma.email_verification_tokens.findMany({ select: { token_hash: true } });
    expect(stored).toHaveLength(1);
    expect(stored[0].token_hash).not.toBe(token);
  });

  it("refuses sign-in with 403 until verified, and still 401 for a wrong password", async () => {
    const { email } = await register();

    expect((await login(email)).status).toBe(403);
    expect((await login(email, "wrong password entirely")).status).toBe(401);

    const verify = await client.post("/api/v1/auth/email/verify", {
      token: tokenFrom(sent.messages[0].text),
    });

    expect(verify.status).toBe(200);

    const after = await login(email);

    expect(after.status).toBe(200);
    expect(after.body.accessToken).toBeTruthy();
  });

  it("spends the link once", async () => {
    await register();
    const token = tokenFrom(sent.messages[0].text);

    expect((await client.post("/api/v1/auth/email/verify", { token })).status).toBe(200);
    expect((await client.post("/api/v1/auth/email/verify", { token })).status).toBe(400);
  });

  it("refuses an expired link", async () => {
    const { email } = await register();
    await prisma.email_verification_tokens.updateMany({ data: { expires_at: new Date(Date.now() - 1000) } });

    const verify = await client.post("/api/v1/auth/email/verify", {
      token: tokenFrom(sent.messages[0].text),
    });

    expect(verify.status).toBe(400);
    expect((await login(email)).status).toBe(403);
  });

  it("resends only to an unverified account, answering the same either way", async () => {
    const { email } = await register();
    sent.messages = [];

    const unknown = await client.post("/api/v1/auth/email/resend", { email: "nobody@test.invalid" });
    expect(unknown.status).toBe(200);
    expect(sent.messages).toHaveLength(0);

    const pending = await client.post("/api/v1/auth/email/resend", { email });
    expect(pending.status).toBe(200);
    expect(sent.messages).toHaveLength(1);

    const fresh = tokenFrom(sent.messages[0].text);
    expect((await client.post("/api/v1/auth/email/verify", { token: fresh })).status).toBe(200);

    sent.messages = [];
    const verified = await client.post("/api/v1/auth/email/resend", { email });
    expect(verified.status).toBe(200);
    expect(sent.messages).toHaveLength(0);
  });

  it("invalidates an older link once a newer one has been used", async () => {
    const { email } = await register();
    const first = tokenFrom(sent.messages[0].text);

    await client.post("/api/v1/auth/email/resend", { email });
    const second = tokenFrom(sent.messages[1].text);

    expect((await client.post("/api/v1/auth/email/verify", { token: second })).status).toBe(200);
    expect((await client.post("/api/v1/auth/email/verify", { token: first })).status).toBe(400);
  });

  it("still registers when the mail transport fails, and logs no address, link or provider text", async () => {
    sent.fail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const { email, response } = await register();

    expect(response.status).toBe(201);

    const logged = errors.mock.calls.flat().join(" ");
    errors.mockRestore();

    expect(logged).toContain("EAUTH 535 AUTH PLAIN");
    expect(logged).not.toContain(email);
    expect(logged).not.toContain("verify-email");
  });
});

describe("password reset mail", () => {
  it("sends a branded reset link to a known address and nothing to an unknown one", async () => {
    const { email } = await register();
    sent.messages = [];

    expect((await client.post("/api/v1/auth/password/forgot", { email: "ghost@test.invalid" })).status).toBe(200);
    expect(sent.messages).toHaveLength(0);

    expect((await client.post("/api/v1/auth/password/forgot", { email })).status).toBe(200);
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0].text).toMatch(/\/reset-password\?token=/);
    expect(sent.messages[0].html).toContain("Choose a new password");
  });

  it("answers 200 even when the transport fails", async () => {
    const { email } = await register();
    sent.fail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await client.post("/api/v1/auth/password/forgot", { email });
    errors.mockRestore();

    expect(response.status).toBe(200);
  });
});
