import { describe, expect, it } from "vitest";

import { expiresLabel, inviteUrl, isExpired } from "./inviteLink";

describe("inviteUrl", () => {
  it("builds the redemption URL the route expects", () => {
    expect(inviteUrl("abc123", "https://example.test")).toBe(
      "https://example.test/invite/abc123",
    );
  });

  it("does not double the slash when the origin carries one", () => {
    // window.location.origin never has a trailing slash, but a configured base
    // URL might, and two slashes would not match /invite/:token.
    expect(inviteUrl("abc123", "https://example.test/")).toBe(
      "https://example.test/invite/abc123",
    );
  });
});

describe("isExpired", () => {
  const now = new Date("2026-08-14T09:00:00.000Z");

  it("decides to the second, not to the day", () => {
    // The distinction that matters: expiresLabel calls both of these "today",
    // and only one of them is still usable.
    expect(isExpired("2026-08-14T09:00:01.000Z", now)).toBe(false);
    expect(isExpired("2026-08-14T08:59:59.000Z", now)).toBe(true);
  });

  it("treats the exact instant as spent", () => {
    // Matches the RPC, which refuses on `expires_at <= now()`.
    expect(isExpired("2026-08-14T09:00:00.000Z", now)).toBe(true);
  });

  it("keeps a live invite", () => {
    expect(isExpired("2026-08-21T09:00:00.000Z", now)).toBe(false);
  });
});

describe("expiresLabel", () => {
  const now = new Date("2026-08-14T09:00:00.000Z");

  it("counts whole days, not fractions of one", () => {
    // The case that made this calendar arithmetic rather than a subtraction:
    // seven days from 09:00 is 6.6 days from 23:00 the same evening, and
    // flooring that reads as six.
    const late = new Date("2026-08-14T23:00:00.000Z");
    const sevenDaysOn = "2026-08-21T23:00:00.000Z";

    expect(expiresLabel(sevenDaysOn, late)).toBe("Expires in 7 days");
  });

  it("names today and tomorrow rather than counting them", () => {
    expect(expiresLabel("2026-08-14T23:59:00.000Z", now)).toBe("Expires today");
    expect(expiresLabel("2026-08-15T01:00:00.000Z", now)).toBe(
      "Expires tomorrow",
    );
  });

  it("reports a row that aged out while the modal was open", () => {
    expect(expiresLabel("2026-08-13T09:00:00.000Z", now)).toBe("Expired");
  });

  it("handles the longest link the server will mint", () => {
    expect(expiresLabel("2026-09-13T09:00:00.000Z", now)).toBe(
      "Expires in 30 days",
    );
  });
});
