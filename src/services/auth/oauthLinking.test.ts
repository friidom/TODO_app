import { describe, expect, it } from "vitest";

import { ApiError } from "../api/client";
import { linkFailureCode, oauthErrorMessage } from "./oauthErrors";
import { linkingProviderOf } from "./pendingLink";

describe("linkingProviderOf", () => {
  it("names the two providers", () => {
    expect(linkingProviderOf("google")).toBe("google");
    expect(linkingProviderOf("github")).toBe("github");
  });

  it("reads the bare marker older challenges left, and anything else, as unnamed", () => {
    expect(linkingProviderOf("1")).toBeNull();
    expect(linkingProviderOf(null)).toBeNull();
    expect(linkingProviderOf("Google")).toBeNull();
    expect(linkingProviderOf("<script>")).toBeNull();
  });
});

describe("linkFailureCode", () => {
  const failed = (status: number) => new ApiError(status, "code", "message");

  it("maps each refusal of /auth/oauth/link/confirm to its own message", () => {
    expect(linkFailureCode(failed(400))).toBe("link_expired");
    expect(linkFailureCode(failed(403))).toBe("link_wrong_account");
    expect(linkFailureCode(failed(409))).toBe("already_linked");
  });

  it("falls back to a generic failure for anything else", () => {
    expect(linkFailureCode(failed(500))).toBe("link_failed");
    expect(linkFailureCode(new TypeError("Failed to fetch"))).toBe(
      "link_failed",
    );
  });

  it("has a message for every code it can produce, distinct from the generic one", () => {
    const generic = oauthErrorMessage("oauth_failed");

    for (const status of [400, 403, 409, 500]) {
      const message = oauthErrorMessage(linkFailureCode(failed(status)));

      expect(message).not.toBeNull();
      expect(message).not.toBe(generic);
    }
  });
});
