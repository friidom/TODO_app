export interface AuthProfile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

export type OrgRole = "member" | "team_lead" | "director" | "superadmin";

export interface AuthUser {
  id: string;
  email: string;
  email_verified_at: string | null;
  created_at: string;
  // The caller's own global role. Defence in depth for the admin nav and
  // SuperadminRoute -- requireSuperadmin on the server is the real gate, and
  // every /admin request 404s without it whatever this says.
  org_role: OrgRole;
  profile: AuthProfile | null;
}

type Listener = (user: AuthUser | null) => void;

let current: AuthUser | null = null;

const listeners = new Set<Listener>();

// A module singleton rather than React state: the API client ends a session
// from outside the tree (a dead refresh token, a sign-out in another tab), and
// AuthProvider mounts above QueryClientProvider so it cannot reach a hook.
export function getSessionUser(): AuthUser | null {
  return current;
}

export function setSessionUser(user: AuthUser | null): void {
  current = user;

  for (const listener of listeners) listener(user);
}

export function subscribeToSession(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
