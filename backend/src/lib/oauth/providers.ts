import { env } from "../../config/env.js";
import { createGitHubAdapter } from "./github.js";
import { createGoogleAdapter } from "./google.js";
import { OAUTH_PROVIDERS, type OAuthProvider, type ProviderAdapter } from "./identity.js";

// One table, so adding a provider is a row rather than a branch. Nothing
// downstream switches on the provider name.
const ADAPTERS: Partial<Record<OAuthProvider, ProviderAdapter>> = {
  ...(env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined
    ? {
        google: createGoogleAdapter({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }),
      }
    : {}),
  ...(env.GITHUB_CLIENT_ID !== undefined && env.GITHUB_CLIENT_SECRET !== undefined
    ? {
        github: createGitHubAdapter({
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        }),
      }
    : {}),
};

export function adapterFor(provider: OAuthProvider): ProviderAdapter | undefined {
  return OVERRIDES.get(provider) ?? ADAPTERS[provider];
}

// The seam the integration suite drives a fake provider through. Both adapters
// accept injected transports, but ADAPTERS is built from env at module load, so
// without this there is no way to reach them once that has happened.
const OVERRIDES = new Map<OAuthProvider, ProviderAdapter>();

export function registerAdapter(provider: OAuthProvider, adapter: ProviderAdapter): void {
  OVERRIDES.set(provider, adapter);
}

export function clearRegisteredAdapters(): void {
  OVERRIDES.clear();
}

// What the sign-in page renders buttons for. A provider with no credentials is
// absent rather than broken.
export function configuredProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((provider) => adapterFor(provider) !== undefined);
}

// Derived from one variable and a constant path, so the value sent to the
// provider, the value sent to the token endpoint and the value registered in
// the provider's console cannot drift apart.
export function callbackUrl(provider: OAuthProvider): string {
  return `${env.API_PUBLIC_URL.replace(/\/+$/, "")}/auth/oauth/${provider}/callback`;
}
