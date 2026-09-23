import type { FetchLike } from "./jwks.js";
import { OAuthProviderError, type ProviderAdapter, type ProviderIdentity } from "./identity.js";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const EMAILS_URL = "https://api.github.com/user/emails";

// GitHub rejects API requests that do not identify themselves.
const USER_AGENT = "todo-app-oauth";

interface GitHubEmail {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// GitHub's /user returns `id` as a number. The account id must survive as an
// exact string, so it is read as a number and stringified rather than being
// trusted to arrive as text.
function asAccountId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);

  return asString(value);
}

// THE rule for GitHub. /user.email is the PUBLIC PROFILE email: free text the
// user types, frequently unverified and often null. Trusting it is the classic
// GitHub-OAuth account-takeover bug — an attacker sets their public email to
// the victim's address and walks into the victim's account. The only address
// GitHub actually vouches for is the primary+verified entry of /user/emails.
export function primaryVerifiedEmail(payload: unknown): string | null {
  if (!Array.isArray(payload)) return null;

  for (const entry of payload as GitHubEmail[]) {
    if (entry.primary === true && entry.verified === true) {
      const email = asString(entry.email);

      if (email !== null) return email;
    }
  }

  return null;
}

export interface GitHubAdapterOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: FetchLike;
}

export function createGitHubAdapter(options: GitHubAdapterOptions): ProviderAdapter {
  // Late-bound rather than captured at construction: resolving globalThis.fetch
  // here would freeze whatever existed at module load, and the integration
  // suite swaps in a fake provider after these adapters are already built.
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));

  async function getJson(url: string, accessToken: string): Promise<unknown> {
    const response = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new OAuthProviderError("userinfo", "GitHub would not describe the account.");
    }

    return response.json();
  }

  return {
    provider: "github",
    // GitHub's OAuth App web flow does not document code_challenge, and sending
    // one risks a rejection. Not required either way: this is a confidential
    // client exchanging the code server-side with a secret, against a redirect
    // URI GitHub itself pins.
    usesPkce: false,
    // No ID token, so there is nothing a nonce could bind to. `state` carries
    // the whole CSRF burden for this provider.
    usesNonce: false,

    authorizeUrl({ redirectUri, state }) {
      const params = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state,
        // Without it GitHub silently reuses an existing authorization, which
        // makes "link a different GitHub account" impossible.
        allow_signup: "true",
      });

      return `${AUTHORIZE_URL}?${params.toString()}`;
    },

    async exchange({ code, redirectUri }) {
      const tokenResponse = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "user-agent": USER_AGENT,
        },
        body: new URLSearchParams({
          code,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        throw new OAuthProviderError("token_exchange", "GitHub rejected the sign-in attempt.");
      }

      // GitHub answers 200 with an `error` field rather than a 4xx when the
      // code is spent or wrong, so the status alone proves nothing.
      const token = (await tokenResponse.json()) as { access_token?: unknown; error?: unknown };
      const accessToken = asString(token.access_token);

      if (accessToken === null) {
        throw new OAuthProviderError("token_exchange", "GitHub returned no access token.");
      }

      const user = (await getJson(USER_URL, accessToken)) as { id?: unknown; name?: unknown; login?: unknown; avatar_url?: unknown };

      const providerAccountId = asAccountId(user.id);

      if (providerAccountId === null) {
        throw new OAuthProviderError("userinfo", "GitHub did not identify the account.");
      }

      const email = primaryVerifiedEmail(await getJson(EMAILS_URL, accessToken));

      // accessToken goes out of scope here and is never returned or persisted:
      // both calls that needed it have already happened.
      return {
        provider: "github",
        providerAccountId,
        email,
        // An address only reaches this point by being primary AND verified, so
        // the two answers cannot disagree.
        emailVerified: email !== null,
        name: asString(user.name) ?? asString(user.login),
        avatarUrl: asString(user.avatar_url),
        // `login` is the best username seed GitHub offers -- but it is a SEED
        // only. It is never the identity key, because a login can be renamed
        // and then claimed by somebody else.
        usernameHint: asString(user.login),
      } satisfies ProviderIdentity;
    },
  };
}
