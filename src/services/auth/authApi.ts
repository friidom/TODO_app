import { api, broadcastSignOut, setAccessToken, toQuery } from "../api/client";
import { setSessionUser, type AuthUser } from "./session";

interface SessionResponse {
  user: AuthUser;
  needsVerification: boolean;
  accessToken?: string;
  expiresIn?: number;
}

function adopt(result: SessionResponse): SessionResponse {
  if (result.accessToken !== undefined) setAccessToken(result.accessToken);

  setSessionUser(result.user);

  return result;
}

export async function signUp(email: string, password: string, username: string) {
  const result = await api.post<SessionResponse>(
    "/auth/register",
    { email, password, username },
    { anonymous: true },
  );

  // needsVerification means no session was issued, so there is nothing to adopt
  // and the form shows its "check your email" state instead.
  return {
    ...(result.needsVerification ? result : adopt(result)),
    needsConfirmation: result.needsVerification,
  };
}

export async function signIn(identifier: string, password: string) {
  return adopt(
    await api.post<SessionResponse>(
      "/auth/login",
      { identifier, password },
      { anonymous: true },
    ),
  );
}

// Never throws: an unknown or already-revoked token still has to clear this tab
// and the others.
export async function signOut(): Promise<void> {
  try {
    await api.post<void>("/auth/logout", undefined, { anonymous: true });
  } finally {
    setAccessToken(null);
    setSessionUser(null);
    broadcastSignOut();
  }
}

export async function fetchMe(): Promise<AuthUser> {
  const { user } = await api.get<{ user: AuthUser }>("/auth/me");

  return user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post<{ ok: true }>("/auth/password/forgot", { email }, { anonymous: true });
}

// Takes the token from the reset link. Supabase signed the user in before this
// ran; the API deliberately issues no session, so the link cannot double as a
// login.
export async function updatePassword(token: string, password: string): Promise<void> {
  await api.post<{ ok: true }>(
    "/auth/password/reset",
    { token, password },
    { anonymous: true },
  );
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { available } = await api.get<{ available: boolean }>(
    `/auth/username-available${toQuery({ username })}`,
    { anonymous: true },
  );

  return available;
}
