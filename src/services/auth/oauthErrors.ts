// Keyed by the fixed identifiers the callback redirects with. The provider's
// own error text is deliberately never forwarded into the URL, so this map
// covers every value that can actually arrive.
const MESSAGES: Record<string, string> = {
  email_unverified:
    "That provider has not verified the email address on your account. Verify it there, then try again.",
  email_missing:
    "That provider did not share a verified email address, which is needed to create an account.",
  account_disabled: "That account has been deactivated.",
  already_linked:
    "That account is already connected to a different user. Disconnect it there first.",
  provider_denied: "The sign-in was cancelled.",
  provider_unavailable: "That sign-in method is not available right now.",
  provider_failed: "That provider's response could not be verified. Please try again.",
  invalid_state: "That sign-in attempt expired or could not be verified. Please try again.",
  invalid_request: "That sign-in link was incomplete. Please try again.",
  oauth_failed: "Something went wrong while signing in. Please try again.",
};

export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;

  return MESSAGES[code] ?? MESSAGES.oauth_failed;
}
