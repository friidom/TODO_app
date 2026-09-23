import { api, apiBaseUrl } from "../api/client";

export type OAuthProvider = "google" | "github";

export interface OAuthConnection {
  id: string;
  provider: string;
  email: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface ConnectionsView {
  connections: OAuthConnection[];
  hasPassword: boolean;
}

// A full navigation, NOT a fetch. fetch cannot follow a cross-origin redirect
// to a provider's consent screen, and the whole point of the flow is that the
// browser goes there itself.
export function startOAuth(provider: OAuthProvider, next?: string | null): void {
  const query = next ? `?next=${encodeURIComponent(next)}` : "";

  window.location.assign(`${apiBaseUrl}/auth/oauth/${provider}/start${query}`);
}

export async function fetchProviders(): Promise<OAuthProvider[]> {
  const { providers } = await api.get<{ providers: OAuthProvider[] }>(
    "/auth/oauth/providers",
    { anonymous: true },
  );

  return providers;
}

// Two steps, and they cannot be collapsed into one link: the access token lives
// in a module variable, so a navigation carries no Authorization header. This
// POST is what tells the server WHO is linking, from a verified token; the
// server seals that into the signed cookie and hands back where to go.
export async function startLink(provider: OAuthProvider): Promise<void> {
  const { authorizeUrl } = await api.post<{ authorizeUrl: string }>(
    "/auth/oauth/link/start",
    { provider },
  );

  window.location.assign(authorizeUrl);
}

export async function confirmLink(token: string): Promise<void> {
  await api.post<void>("/auth/oauth/link/confirm", { token });
}

export function fetchConnections(): Promise<ConnectionsView> {
  return api.get<ConnectionsView>("/auth/oauth/connections");
}

export async function unlinkConnection(id: string): Promise<void> {
  await api.del<void>(`/auth/oauth/connections/${id}`);
}
