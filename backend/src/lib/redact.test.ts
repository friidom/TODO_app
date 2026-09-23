import { describe, expect, it } from "vitest";

import { redactUrl } from "./redact.js";

describe("redactUrl", () => {
  // The reason this module exists: an authorization code is a live bearer
  // credential and it arrives in a GET query string, which morgan prints.
  it("redacts an OAuth callback", () => {
    const redacted = redactUrl(
      "/api/v1/auth/oauth/google/callback?code=4%2F0AY0e-g7live&state=xyz",
    );

    expect(redacted).not.toContain("4/0AY0e-g7live");
    expect(redacted).not.toContain("4%2F0AY0e-g7live");
    expect(redacted).not.toContain("xyz");
    expect(redacted).toContain("/api/v1/auth/oauth/google/callback");
  });

  it("redacts every credential-bearing parameter it knows", () => {
    for (const key of [
      "code",
      "state",
      "token",
      "id_token",
      "access_token",
      "refresh_token",
      "code_verifier",
      "client_secret",
      "link",
    ]) {
      expect(redactUrl(`/x?${key}=supersecretvalue`), key).not.toContain("supersecretvalue");
    }
  });

  it("is case-insensitive about the parameter name", () => {
    expect(redactUrl("/x?CODE=secret")).not.toContain("secret");
  });

  // The marker must survive URLSearchParams without being percent-encoded, or
  // the access log reads "code=%5Bredacted%5D".
  it("uses a marker that needs no escaping", () => {
    expect(redactUrl("/x?code=secret")).toBe("/x?code=REDACTED");
  });

  // Returned byte-identical when nothing matched, rather than round-tripped
  // through URLSearchParams — re-encoding every logged URL would make the
  // access log disagree with what was actually requested.
  it("leaves a url with nothing to redact byte-identical", () => {
    expect(redactUrl("/x?next=/boards/1&view=list")).toBe("/x?next=/boards/1&view=list");
  });

  it("still redacts when a harmless parameter sits beside a secret", () => {
    const redacted = redactUrl("/x?next=/boards/1&code=secret");

    expect(redacted).not.toContain("secret");
    expect(redacted).toContain("next=");
  });

  it("returns a url with no query string untouched", () => {
    expect(redactUrl("/api/v1/auth/me")).toBe("/api/v1/auth/me");
    expect(redactUrl("")).toBe("");
  });

  // It runs inside a logger, so it must never be the thing that throws.
  it("does not throw on malformed input", () => {
    for (const input of ["/x?", "/x?&&", "/x?=novalue", "?code=a", "/x?code", "%"]) {
      expect(() => redactUrl(input), input).not.toThrow();
    }
  });

  it("redacts a repeated parameter", () => {
    expect(redactUrl("/x?code=one&code=two")).not.toContain("two");
  });
});
