import { describe, expect, it } from "vitest";

import { passwordResetEmail, verificationEmail } from "./mailTemplates.js";

const LINK = "https://veylo.example/verify-email?token=abc_DEF-123";

describe("verificationEmail", () => {
  it("carries the link and the expiry in both the text and the html part", () => {
    const mail = verificationEmail(LINK, 24);

    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain("24 hours");
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.html).toContain("24 hours");
  });

  it("escapes a link that would break out of the attribute", () => {
    const mail = verificationEmail('https://x.example/?a="><script>', 24);

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("passwordResetEmail", () => {
  it("carries the link and the expiry", () => {
    const mail = passwordResetEmail("https://veylo.example/reset-password?token=t", 60);

    expect(mail.subject).toMatch(/reset/i);
    expect(mail.text).toContain("60 minutes");
    expect(mail.html).toContain('href="https://veylo.example/reset-password?token=t"');
  });
});
