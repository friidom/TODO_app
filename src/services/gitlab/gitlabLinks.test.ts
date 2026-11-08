import { describe, expect, it } from "vitest";

import type { GitLabLink, GitLabLinkStatus } from "./gitlabApi";
import {
  LINK_POLL_MS,
  LINK_STATUS_LABEL,
  boardGitLabSource,
  displayStatus,
  failureMessageKey,
  linksPollInterval,
  signingTokenProblem,
} from "./gitlabLinks";

function link(status: GitLabLinkStatus): GitLabLink {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    instance_url: "https://gitlab.com",
    project_path: "acme/backend",
    project_url: "https://gitlab.com/acme/backend",
    webhook_url: "https://veylo.example/api/v1/integrations/gitlab/webhooks/1",
    status,
    signing_token_set_at: null,
    last_delivery_at: null,
    last_failure_at: null,
    last_failure_reason: null,
    created_at: "2026-10-05T10:00:00.000Z",
  };
}

describe("linksPollInterval", () => {
  it("asks again while a link waits on GitLab", () => {
    expect(
      linksPollInterval({
        data: [link("awaiting_delivery")],
        status: "success",
      }),
    ).toBe(LINK_POLL_MS);
    expect(
      linksPollInterval({
        data: [link("active"), link("failing")],
        status: "success",
      }),
    ).toBe(LINK_POLL_MS);
  });

  it("stays quiet when nothing can change without the admin", () => {
    expect(
      linksPollInterval({
        data: [link("active"), link("awaiting_token")],
        status: "success",
      }),
    ).toBe(false);
    expect(linksPollInterval({ data: [], status: "success" })).toBe(false);
    expect(linksPollInterval({ data: undefined, status: "pending" })).toBe(
      false,
    );
  });

  it("stops after a failed refresh rather than toasting every interval", () => {
    expect(
      linksPollInterval({ data: [link("awaiting_delivery")], status: "error" }),
    ).toBe(false);
  });
});

describe("signingTokenProblem", () => {
  it("asks for a token when there is none", () => {
    expect(signingTokenProblem("")).toBe("required");
    expect(signingTokenProblem("  \n")).toBe("required");
  });

  it("catches a pasted Secret token, which GitLab does not prefix", () => {
    expect(signingTokenProblem("my-shared-secret")).toBe("prefix");
    expect(signingTokenProblem("WHSEC_abc")).toBe("prefix");
  });

  it("accepts a signing token with the whitespace a paste brings along", () => {
    expect(
      signingTokenProblem(" whsec_c3ludGhldGljLXRva2Vu\n"),
    ).toBeUndefined();
  });
});

describe("failureMessageKey", () => {
  it("gives each reason the server records its own message", () => {
    const reasons = [
      "headers",
      "signature",
      "timestamp",
      "token",
      "project",
      "payload",
    ];
    const keys = reasons.map(failureMessageKey);

    expect(new Set(keys).size).toBe(reasons.length);
    expect(keys).not.toContain("gitlab.failure.unknown");
  });

  it("falls back for a reason this build has never heard of", () => {
    expect(failureMessageKey("tls")).toBe("gitlab.failure.unknown");
    expect(failureMessageKey("toString")).toBe("gitlab.failure.unknown");
    expect(failureMessageKey(null)).toBe("gitlab.failure.unknown");
  });
});

describe("boardGitLabSource", () => {
  it("reads through the space whenever the space has a project, whoever looks", () => {
    expect(
      boardGitLabSource({ spaceId: "s", ownsSpace: false, spaceLinked: true }),
    ).toBe("space");
  });

  it("offers the space's settings only to the space's owner", () => {
    expect(
      boardGitLabSource({ spaceId: "s", ownsSpace: true, spaceLinked: false }),
    ).toBe("ownSpace");
    expect(
      boardGitLabSource({ spaceId: "s", ownsSpace: false, spaceLinked: false }),
    ).toBe("otherSpace");
  });

  it("says when there is no space to inherit from", () => {
    expect(
      boardGitLabSource({
        spaceId: null,
        ownsSpace: false,
        spaceLinked: false,
      }),
    ).toBe("unfiled");
  });
});

describe("displayStatus", () => {
  const STATUSES: GitLabLinkStatus[] = [
    "awaiting_token",
    "awaiting_delivery",
    "active",
    "failing",
  ];

  it("is the link's own status when the server can store tokens", () => {
    for (const status of STATUSES) {
      expect(displayStatus(status, true)).toBe(status);
    }
  });

  // the production case: a project connected, no INTEGRATION_SECRET_KEY, and a card that asked for a token the
  // server would then refuse to store
  it("is server setup, not a missing token, when the server cannot store one", () => {
    for (const status of STATUSES) {
      expect(displayStatus(status, false)).toBe("server_setup");
    }

    expect(LINK_STATUS_LABEL.server_setup).not.toBe(
      LINK_STATUS_LABEL.awaiting_token,
    );
  });
});
