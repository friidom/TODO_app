import { AppError } from "../errors.js";

export const OAUTH_PROVIDERS = ["google", "github"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

// What every provider is reduced to before any policy runs. oauth.service.ts
// never learns which provider it is handling — the same reason lib/permissions
// and lib/workflow are tables rather than a series of ifs. Adding a provider
// must not add a branch to the account-identity rules.
export interface ProviderIdentity {
  provider: OAuthProvider;
  // The provider's own immutable subject id — Google's `sub`, GitHub's numeric
  // `id`. Never an email, and never GitHub's `login`: logins are renameable and
  // reusable by someone else once released.
  providerAccountId: string;
  email: string | null;
  // Only ever true when the PROVIDER asserted it. github.ts derives this from
  // /user/emails, never from /user.email.
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
  // A seed for provisioning, not an identifier. lib/username.ts repairs
  // whatever arrives into a valid handle and resolves collisions with a
  // suffix, so this only has to be a reasonable starting point.
  usernameHint: string | null;
}

export interface ProviderAdapter {
  provider: OAuthProvider;
  // Whether the provider supports PKCE. Google does; GitHub's OAuth App web
  // flow does not document code_challenge, and sending one risks an error, so
  // providers.ts gates it rather than assuming.
  usesPkce: boolean;
  // Google returns an ID token whose nonce binds it to this browser's attempt.
  // GitHub has no ID token, so there is nothing to bind and `state` carries the
  // whole CSRF burden alone.
  usesNonce: boolean;
  authorizeUrl(params: {
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string;
  // Exchanges the code and returns a normalized identity. Implementations must
  // discard the provider's access and refresh tokens — nothing downstream may
  // receive them, because there is nowhere in the schema to put them.
  exchange(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<ProviderIdentity>;
}

// The provider answered, but not with anything we can authenticate on. Mapped
// to a redirect rather than a JSON body by the controller: this always happens
// mid-navigation, where an error document is a dead end.
export class OAuthProviderError extends AppError {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super("bad_request", message);

    this.name = "OAuthProviderError";
    this.reason = reason;
  }
}
