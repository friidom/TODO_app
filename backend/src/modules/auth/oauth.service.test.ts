import { describe, expect, it } from "vitest";

import type { ProviderIdentity } from "../../lib/oauth/identity.js";
import { resolveIdentity, type IdentityLookups } from "./oauth.service.js";

function identity(over: Partial<ProviderIdentity> = {}): ProviderIdentity {
  return {
    provider: "google",
    providerAccountId: "sub-1",
    email: "ada@example.test",
    emailVerified: true,
    name: "Ada",
    avatarUrl: null,
    usernameHint: "ada",
    ...over,
  };
}

function lookups(over: Partial<IdentityLookups> = {}): IdentityLookups {
  return { byProvider: null, byEmail: null, ...over };
}

describe("resolveIdentity", () => {
  describe("R1 — a known identity signs in", () => {
    it("returns the linked user", () => {
      const outcome = resolveIdentity(
        identity(),
        lookups({ byProvider: { id: "id-1", userId: "user-1", deactivated: false } }),
      );

      expect(outcome).toEqual({ kind: "sign_in", userId: "user-1", identityId: "id-1" });
    });

    // The whole point of keying on the subject: the provider may rename, or
    // stop verifying, the address behind a link that already exists.
    it("ignores the email entirely — changed, unverified or absent", () => {
      const byProvider = { id: "id-1", userId: "user-1", deactivated: false };

      for (const over of [
        { email: "somebody-else@example.test" },
        { emailVerified: false },
        { email: null, emailVerified: false },
      ]) {
        expect(resolveIdentity(identity(over), lookups({ byProvider }))).toEqual({
          kind: "sign_in",
          userId: "user-1",
          identityId: "id-1",
        });
      }
    });

    // R1 is checked before every email rule, so an existing account whose
    // address now collides with someone else's is still a sign-in, not a
    // challenge.
    it("wins over an email that matches a different user", () => {
      const outcome = resolveIdentity(
        identity(),
        lookups({
          byProvider: { id: "id-1", userId: "user-1", deactivated: false },
          byEmail: { userId: "user-2", deactivated: false },
        }),
      );

      expect(outcome).toEqual({ kind: "sign_in", userId: "user-1", identityId: "id-1" });
    });

    it("refuses a deactivated account", () => {
      const outcome = resolveIdentity(
        identity(),
        lookups({ byProvider: { id: "id-1", userId: "user-1", deactivated: true } }),
      );

      expect(outcome).toEqual({ kind: "refuse", reason: "account_disabled" });
    });
  });

  describe("R2 — nothing the provider vouches for", () => {
    it("refuses an unverified address", () => {
      expect(resolveIdentity(identity({ emailVerified: false }), lookups())).toEqual({
        kind: "refuse",
        reason: "email_unverified",
      });
    });

    it("refuses a missing address", () => {
      expect(
        resolveIdentity(identity({ email: null, emailVerified: false }), lookups()),
      ).toEqual({ kind: "refuse", reason: "email_unverified" });
    });

    // Never creates and never matches, even when the address would have hit an
    // existing account. This is the branch that stops GitHub's unverified
    // public profile email being a takeover path.
    it("refuses rather than matching an existing user", () => {
      const outcome = resolveIdentity(
        identity({ emailVerified: false }),
        lookups({ byEmail: { userId: "victim", deactivated: false } }),
      );

      expect(outcome).toEqual({ kind: "refuse", reason: "email_unverified" });
    });
  });

  describe("R3 — a genuinely new person", () => {
    it("creates when nobody holds the address", () => {
      expect(resolveIdentity(identity(), lookups())).toEqual({
        kind: "create_user",
        email: "ada@example.test",
      });
    });

    // Case 5: the same human with two different provider addresses. Creating a
    // second account is the honest answer to having no evidence they are one
    // person; guessing is what produces takeovers.
    it("creates for a second provider carrying a different address", () => {
      const outcome = resolveIdentity(
        identity({ provider: "github", providerAccountId: "gh-9", email: "other@example.test" }),
        lookups(),
      );

      expect(outcome).toEqual({ kind: "create_user", email: "other@example.test" });
    });

    // The outcome carries the address the policy proved non-null, so the
    // create site never has to assert it.
    it("hands the create site the verified address", () => {
      const outcome = resolveIdentity(identity({ email: "new@example.test" }), lookups());

      expect(outcome).toMatchObject({ kind: "create_user", email: "new@example.test" });
    });
  });

  describe("R4 — the collision is a challenge, never a merge", () => {
    it("asks for proof instead of signing in", () => {
      const outcome = resolveIdentity(
        identity({ provider: "github", providerAccountId: "gh-9" }),
        lookups({ byEmail: { userId: "user-1", deactivated: false } }),
      );

      expect(outcome).toEqual({ kind: "needs_link", userId: "user-1" });
    });

    it("never creates a second account for a verified colliding address", () => {
      const outcome = resolveIdentity(
        identity({ provider: "github", providerAccountId: "gh-9" }),
        lookups({ byEmail: { userId: "user-1", deactivated: false } }),
      );

      expect(outcome.kind).not.toBe("create_user");
      expect(outcome.kind).not.toBe("sign_in");
    });

    it("refuses a deactivated target rather than challenging it", () => {
      const outcome = resolveIdentity(
        identity(),
        lookups({ byEmail: { userId: "user-1", deactivated: true } }),
      );

      expect(outcome).toEqual({ kind: "refuse", reason: "account_disabled" });
    });
  });

  // The property the whole design rests on, asserted directly rather than
  // implied by the cases above.
  it("never signs anyone in on the strength of an email alone", () => {
    const emailOnly = lookups({ byEmail: { userId: "victim", deactivated: false } });

    for (const over of [
      {},
      { emailVerified: false },
      { provider: "github" as const, providerAccountId: "gh-1" },
      { email: null, emailVerified: false },
    ]) {
      expect(resolveIdentity(identity(over), emailOnly).kind).not.toBe("sign_in");
    }
  });
});
