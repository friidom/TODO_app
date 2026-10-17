import { afterEach, describe, expect, it, vi } from "vitest";

// providers.ts builds its adapters from env at import, so each case stubs env and imports a fresh copy. Blank values
// count as unset in config/env.ts, which is also what stops a developer's backend/.env (dotenv never overwrites a
// variable that is already set) from configuring the "no credentials" case.
async function loadProviders(vars: Record<string, string>) {
  vi.resetModules();

  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);

  return import("./providers.js");
}

const NO_CREDENTIALS = {
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
};

const BOTH = {
  GOOGLE_CLIENT_ID: "google-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configured providers", () => {
  it("offers nothing when no credentials are set", async () => {
    const providers = await loadProviders(NO_CREDENTIALS);

    expect(providers.configuredProviders()).toEqual([]);
    expect(providers.adapterFor("google")).toBeUndefined();
    expect(providers.adapterFor("github")).toBeUndefined();
  });

  it("offers exactly the providers whose credentials are set", async () => {
    const providers = await loadProviders({
      ...NO_CREDENTIALS,
      GITHUB_CLIENT_ID: BOTH.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: BOTH.GITHUB_CLIENT_SECRET,
    });

    expect(providers.configuredProviders()).toEqual(["github"]);
  });

  it("refuses to start with half a provider", async () => {
    await expect(
      loadProviders({ ...NO_CREDENTIALS, GOOGLE_CLIENT_ID: BOTH.GOOGLE_CLIENT_ID }),
    ).rejects.toThrow(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together/);
  });
});

describe("production callbacks", () => {
  it("derives both callbacks from the public https origin", async () => {
    const providers = await loadProviders({ ...BOTH, API_PUBLIC_URL: "https://veylo.work.gd/api/v1/" });

    expect(providers.callbackUrl("google")).toBe(
      "https://veylo.work.gd/api/v1/auth/oauth/google/callback",
    );
    expect(providers.callbackUrl("github")).toBe(
      "https://veylo.work.gd/api/v1/auth/oauth/github/callback",
    );
  });

  it("hands each provider that same callback in its authorize url", async () => {
    const providers = await loadProviders({ ...BOTH, API_PUBLIC_URL: "https://veylo.work.gd/api/v1" });

    for (const name of ["google", "github"] as const) {
      const url = new URL(
        providers.adapterFor(name)!.authorizeUrl({
          redirectUri: providers.callbackUrl(name),
          state: "state",
          nonce: "nonce",
          codeChallenge: "challenge",
        }),
      );

      expect(url.protocol).toBe("https:");
      expect(url.searchParams.get("redirect_uri")).toBe(
        `https://veylo.work.gd/api/v1/auth/oauth/${name}/callback`,
      );
      expect(url.searchParams.get("client_id")).toBe(
        name === "google" ? BOTH.GOOGLE_CLIENT_ID : BOTH.GITHUB_CLIENT_ID,
      );
      expect(url.searchParams.get("state")).toBe("state");
      expect(url.toString()).not.toContain("secret");
    }
  });
});
