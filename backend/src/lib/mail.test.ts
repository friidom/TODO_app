import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  createTransport: (options: Record<string, unknown>) => {
    smtp.options.push(options);

    return { sendMail: smtp.sendMail };
  },
}));

async function loadMail(port: string) {
  vi.resetModules();
  vi.stubEnv("MAIL_DRIVER", "smtp");
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_PORT", port);
  vi.stubEnv("SMTP_USER", "sender@example.test");
  vi.stubEnv("SMTP_PASS", "app-password-value");
  vi.stubEnv("MAIL_FROM", "Veylo <sender@example.test>");

  return import("./mail.js");
}

beforeEach(() => {
  smtp.options = [];
  smtp.sendMail.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("smtp driver", () => {
  it("upgrades to TLS on 587, bounds every wait, and reuses one transport", async () => {
    smtp.sendMail.mockResolvedValue({});
    const { mailer } = await loadMail("587");

    await mailer.send({ to: "a@example.test", subject: "s", text: "t", html: "<p>t</p>" });
    await mailer.send({ to: "b@example.test", subject: "s", text: "t" });

    expect(smtp.options).toHaveLength(1);
    expect(smtp.options[0]).toMatchObject({
      host: "smtp.example.test",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    expect(smtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Veylo <sender@example.test>", html: "<p>t</p>" }),
    );
  });

  it("uses implicit TLS on 465", async () => {
    smtp.sendMail.mockResolvedValue({});
    const { mailer } = await loadMail("465");

    await mailer.send({ to: "a@example.test", subject: "s", text: "t" });

    expect(smtp.options[0]).toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("lets a rejected send reach the caller", async () => {
    smtp.sendMail.mockRejectedValue(Object.assign(new Error("535"), { code: "EAUTH" }));
    const { mailer } = await loadMail("587");

    await expect(mailer.send({ to: "a@example.test", subject: "s", text: "t" })).rejects.toThrow();
  });
});

describe("describeMailError", () => {
  it("keeps the code, response code and SMTP step, and drops the message", async () => {
    const { describeMailError } = await loadMail("587");

    const described = describeMailError(
      Object.assign(new Error("535 5.7.8 rejected app-password-value for a@example.test"), {
        code: "EAUTH",
        responseCode: 535,
        command: "AUTH PLAIN",
      }),
    );

    expect(described).toBe("EAUTH 535 AUTH PLAIN");
    expect(described).not.toContain("app-password-value");
    expect(described).not.toContain("a@example.test");
  });

  it("names a timeout and survives a non-error", async () => {
    const { describeMailError } = await loadMail("587");

    expect(describeMailError(Object.assign(new Error("x"), { code: "ETIMEDOUT", command: "CONN" }))).toBe(
      "ETIMEDOUT CONN",
    );
    expect(describeMailError("boom")).toBe("unknown error");
  });
});
