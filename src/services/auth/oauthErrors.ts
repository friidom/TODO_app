import i18n from "@/components/i18n";
import { ApiError } from "../api/client";

// Keyed by the fixed identifiers the callback redirects with. The provider's
// own error text is deliberately never forwarded into the URL, so this map
// covers every value that can actually arrive.
const MESSAGES: Record<string, string> = {
  email_unverified: "oauth.errors.emailUnverified",
  email_missing: "oauth.errors.emailMissing",
  account_disabled: "oauth.errors.accountDisabled",
  already_linked: "oauth.errors.alreadyLinked",
  provider_denied: "oauth.errors.providerDenied",
  provider_unavailable: "oauth.errors.providerUnavailable",
  provider_failed: "oauth.errors.providerFailed",
  invalid_state: "oauth.errors.invalidState",
  invalid_request: "oauth.errors.invalidRequest",
  oauth_failed: "oauth.errors.oauthFailed",
  link_expired: "oauth.errors.linkExpired",
  link_wrong_account: "oauth.errors.linkWrongAccount",
  link_failed: "oauth.errors.linkFailed",
};

// Why spending a sign-in challenge failed, as one of the codes above, so the profile page can say so. Keyed on the
// status /auth/oauth/link/confirm answers with: 400 spent or expired, 403 another account's, 409 linked elsewhere.
export function linkFailureCode(error: unknown): string {
  const status = error instanceof ApiError ? error.status : null;

  if (status === 400) return "link_expired";
  if (status === 403) return "link_wrong_account";
  if (status === 409) return "already_linked";

  return "link_failed";
}

export function oauthErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;

  return i18n.t(MESSAGES[code] ?? MESSAGES.oauth_failed);
}
