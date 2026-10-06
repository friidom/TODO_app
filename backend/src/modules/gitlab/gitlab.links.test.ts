import { describe, expect, it } from "vitest";

import {
  branchUrl,
  buildWebhookUrl,
  commitUrl,
  linkStatus,
  mergeRequestUrl,
  parseProjectUrl,
  projectPathOf,
  projectUrl,
} from "./gitlab.links.js";

describe("parseProjectUrl", () => {
  it.each([
    ["the project page", "https://gitlab.com/friidom/veylo-webhook-test"],
    ["a trailing slash", "https://gitlab.com/friidom/veylo-webhook-test/"],
    ["the https clone url", "https://gitlab.com/friidom/veylo-webhook-test.git"],
    ["a page inside the project", "https://gitlab.com/friidom/veylo-webhook-test/-/merge_requests/1"],
    ["a query string and fragment", "https://gitlab.com/friidom/veylo-webhook-test?tab=readme#top"],
    ["surrounding whitespace", "  https://gitlab.com/friidom/veylo-webhook-test \n"],
    ["just the path", "friidom/veylo-webhook-test"],
    ["the host without a scheme", "gitlab.com/friidom/veylo-webhook-test"],
  ])("reads %s", (_label, input) => {
    expect(parseProjectUrl(input)).toEqual({
      ok: true,
      instance_url: "https://gitlab.com",
      project_path: "friidom/veylo-webhook-test",
    });
  });

  it("keeps subgroups and the case the admin typed", () => {
    expect(parseProjectUrl("https://gitlab.com/Acme/Platform/Core-API")).toEqual({
      ok: true,
      instance_url: "https://gitlab.com",
      project_path: "Acme/Platform/Core-API",
    });
  });

  it("supports a self-managed instance on its own port", () => {
    expect(parseProjectUrl("https://Git.Example.com:8443/team/app")).toEqual({
      ok: true,
      instance_url: "https://git.example.com:8443",
      project_path: "team/app",
    });
  });

  it.each([
    ["plain http", "http://gitlab.com/acme/backend", "https"],
    ["an ssh clone url", "ssh://git@gitlab.com/acme/backend.git", "https"],
    ["credentials in the url", "https://user:secret@gitlab.com/acme/backend", "url"],
    ["an IPv6 host", "https://[::1]/acme/backend", "url"],
    ["a project without a namespace", "https://gitlab.com/backend", "path"],
    ["only the instance", "https://gitlab.com", "path"],
    ["an empty string", "   ", "path"],
    ["a scp-style clone url", "git@gitlab.com:acme/backend.git", "path"],
    ["characters GitLab does not allow", "https://gitlab.com/acme/back%20end", "path"],
    ["a dot-dot segment", "acme/../backend", "path"],
    ["a path over 255 characters", `acme/${"a".repeat(260)}`, "path"],
  ])("refuses %s", (_label, input, error) => {
    expect(parseProjectUrl(input)).toEqual({ ok: false, error });
  });
});

describe("linkStatus", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 18, minutes));

  it("waits for a token first", () => {
    expect(
      linkStatus({ signing_token_set_at: null, last_delivery_at: null, last_failure_at: at(1) }),
    ).toBe("awaiting_token");
  });

  it("waits for the first delivery once the token is saved", () => {
    expect(linkStatus({ signing_token_set_at: at(1), last_delivery_at: null, last_failure_at: null })).toBe(
      "awaiting_delivery",
    );
  });

  it("is active after a verified delivery", () => {
    expect(linkStatus({ signing_token_set_at: at(1), last_delivery_at: at(2), last_failure_at: null })).toBe(
      "active",
    );
  });

  it("is failing when the latest event is a refused delivery", () => {
    expect(linkStatus({ signing_token_set_at: at(1), last_delivery_at: at(2), last_failure_at: at(3) })).toBe(
      "failing",
    );
    expect(linkStatus({ signing_token_set_at: at(1), last_delivery_at: null, last_failure_at: at(3) })).toBe(
      "failing",
    );
  });

  it("forgets a failure once a later delivery succeeds or a new token is saved", () => {
    expect(linkStatus({ signing_token_set_at: at(1), last_delivery_at: at(4), last_failure_at: at(3) })).toBe(
      "active",
    );
    expect(linkStatus({ signing_token_set_at: at(5), last_delivery_at: null, last_failure_at: at(3) })).toBe(
      "awaiting_delivery",
    );
  });
});

describe("project and development urls", () => {
  const pending = { instance_url: "https://gitlab.com", project_path: "acme/backend", project_web_url: null };
  const delivered = { ...pending, project_web_url: "https://gitlab.com/Acme/Backend-Renamed" };

  it("falls back to the connected path until GitLab reports its own", () => {
    expect(projectUrl(pending)).toBe("https://gitlab.com/acme/backend");
    expect(projectPathOf(pending)).toBe("acme/backend");
  });

  it("follows the project after a rename in GitLab", () => {
    expect(projectUrl(delivered)).toBe("https://gitlab.com/Acme/Backend-Renamed");
    expect(projectPathOf(delivered)).toBe("Acme/Backend-Renamed");
  });

  it("builds GitLab's own commit, branch and merge request addresses", () => {
    const web = "https://gitlab.com/friidom/veylo-webhook-test";

    expect(commitUrl(web, "74be48fbe4265f21e00b8aa93bb46614d720c4de")).toBe(
      "https://gitlab.com/friidom/veylo-webhook-test/-/commit/74be48fbe4265f21e00b8aa93bb46614d720c4de",
    );
    expect(branchUrl(web, "feature/API-23-webhook")).toBe(
      "https://gitlab.com/friidom/veylo-webhook-test/-/tree/feature/API-23-webhook",
    );
    expect(branchUrl(web, "fix/a b#c?")).toBe(
      "https://gitlab.com/friidom/veylo-webhook-test/-/tree/fix/a%20b%23c%3F",
    );
    expect(mergeRequestUrl(web, 42)).toBe("https://gitlab.com/friidom/veylo-webhook-test/-/merge_requests/42");
  });
});

describe("buildWebhookUrl", () => {
  const link = "c88ec266-2059-46e2-b91a-8289894e31ee";

  it("builds on API_PUBLIC_URL when no webhook origin is configured", () => {
    expect(
      buildWebhookUrl(link, { apiPublicUrl: "http://localhost:3000/api/v1/", webhookPublicOrigin: undefined }),
    ).toBe(`http://localhost:3000/api/v1/integrations/gitlab/webhooks/${link}`);
  });

  it("puts the receiver's full path on a configured origin, whatever API_PUBLIC_URL says", () => {
    expect(
      buildWebhookUrl(link, {
        apiPublicUrl: "http://localhost:3000/api/v1",
        webhookPublicOrigin: "https://abc-def.trycloudflare.com/",
      }),
    ).toBe(`https://abc-def.trycloudflare.com/api/v1/integrations/gitlab/webhooks/${link}`);
  });
});
