import i18n from "@/components/i18n";

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
};

export function oauthErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;

  return i18n.t(MESSAGES[code] ?? MESSAGES.oauth_failed);
}
