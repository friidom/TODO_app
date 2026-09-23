const KEY = "kan:pending-oauth-link";

// The challenge token has to outlive the login page: useLogin navigates away
// on success, so a component sitting on /login is unmounted before a session
// ever exists to spend the token with. sessionStorage is per-tab and dies with
// it, which matches a token that is single-use and expires in 15 minutes.
//
// Not a credential: it cannot produce a session, only attach an identity to the
// account the caller has ALREADY authenticated as, and the server still refuses
// it unless that account is the one the token names.
export function storePendingLink(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Private mode, or storage disabled. The link simply is not completed, and
    // the person can start it again from settings.
  }
}

export function readPendingLink(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingLink(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do: a token that cannot be cleared is already unusable once
    // the server has consumed it.
  }
}
